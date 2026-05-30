use std::collections::BTreeMap;

use once_cell::sync::Lazy;
use regex::Regex;

use crate::types::{Entity, SpringConfigEnvironment, SpringConfigPropertySource, User};

const DEFAULT_LABEL: &str = "main";
const DEFAULT_PROFILE: &str = "default";
const SHARED_APPLICATION: &str = "application";

static METADATA_NAME: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\[[^\]]+\]$").unwrap());

fn normalize_metadata_name(name: &str) -> Option<String> {
    let trimmed = name.trim();
    if !METADATA_NAME.is_match(trimmed) {
        return None;
    }
    Some(trimmed[1..trimmed.len() - 1].trim().to_lowercase())
}

fn is_metadata_name(name: &str) -> bool {
    normalize_metadata_name(name).is_some()
}

fn metadata_value(entity: &Entity, name: &str) -> Option<String> {
    let target = name.to_lowercase();
    entity
        .attributes
        .iter()
        .find(|attribute| normalize_metadata_name(&attribute.name).as_deref() == Some(&target))
        .map(|attribute| attribute.value.clone())
}

fn metadata_values(entity: &Entity, name: &str) -> Vec<String> {
    metadata_value(entity, name)
        .map(|value| {
            value
                .split(',')
                .map(|part| part.trim().to_string())
                .filter(|part| !part.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn is_enabled(entity: &Entity) -> bool {
    match metadata_value(entity, "config.enabled") {
        None => true,
        Some(value) => !matches!(
            value.trim().to_lowercase().as_str(),
            "0" | "false" | "no" | "off"
        ),
    }
}

pub fn can_read(user: &User, entity: &Entity) -> bool {
    user.can_manage_data() || entity.owner_user_id == user.id
}

fn source(entity: &Entity) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    for attribute in &entity.attributes {
        if is_metadata_name(&attribute.name) || attribute.name.trim().is_empty() {
            continue;
        }
        map.insert(attribute.name.trim().to_string(), attribute.value.clone());
    }
    map
}

fn entity_rank(application: &str, entity: &Entity, label: &str, profiles: &[String]) -> Option<f64> {
    if !is_enabled(entity) {
        return None;
    }

    let applications = metadata_values(entity, "config.application");
    let profile_meta = metadata_values(entity, "config.profile");
    let labels = metadata_values(entity, "config.label");

    if applications.is_empty() || profile_meta.is_empty() {
        return None;
    }

    let application_rank: i64 = if applications.iter().any(|a| a == application) {
        0
    } else if applications.iter().any(|a| a == SHARED_APPLICATION) {
        200
    } else {
        return None;
    };

    let mut profile_indexes: Vec<i64> = Vec::new();
    for profile in &profile_meta {
        if profile == DEFAULT_PROFILE {
            profile_indexes.push(100);
        } else if let Some(index) = profiles.iter().position(|p| p == profile) {
            profile_indexes.push(index as i64);
        }
    }
    let profile_rank = match profile_indexes.into_iter().min() {
        Some(rank) => rank,
        None => return None,
    };

    let label_rank: i64 = if labels.is_empty() {
        1
    } else if labels.iter().any(|l| l == label) {
        0
    } else {
        return None;
    };

    Some(application_rank as f64 + profile_rank as f64 + (label_rank as f64) / 10.0)
}

struct RankedSource {
    name: String,
    source: BTreeMap<String, String>,
    rank: f64,
}

pub fn build_environment(
    entities: &[Entity],
    application: &str,
    profiles: &[String],
    label: &str,
    requested_label_present: bool,
) -> SpringConfigEnvironment {
    let mut ranked: Vec<RankedSource> = entities
        .iter()
        .filter_map(|entity| {
            let rank = entity_rank(application, entity, label, profiles)?;
            let app = metadata_value(entity, "config.application").unwrap_or_else(|| "unknown".into());
            let profile = metadata_value(entity, "config.profile").unwrap_or_else(|| "unknown".into());
            let lbl = metadata_value(entity, "config.label").unwrap_or_else(|| DEFAULT_LABEL.into());
            let src = source(entity);
            if src.is_empty() {
                return None;
            }
            Some(RankedSource {
                name: format!("rebirth:{app}:{profile}:{lbl}:{}", entity.id),
                source: src,
                rank,
            })
        })
        .collect();

    ranked.sort_by(|left, right| {
        if (left.rank - right.rank).abs() < f64::EPSILON {
            left.name.cmp(&right.name)
        } else {
            left.rank.partial_cmp(&right.rank).unwrap_or(std::cmp::Ordering::Equal)
        }
    });

    let property_sources: Vec<SpringConfigPropertySource> = ranked
        .iter()
        .map(|item| SpringConfigPropertySource {
            name: item.name.clone(),
            source: item.source.clone(),
        })
        .collect();

    let version = if property_sources.is_empty() {
        None
    } else {
        Some(
            property_sources
                .iter()
                .map(|ps| ps.name.clone())
                .collect::<Vec<_>>()
                .join("|"),
        )
    };

    SpringConfigEnvironment {
        label: if requested_label_present {
            Some(label.to_string())
        } else {
            None
        },
        name: application.to_string(),
        profiles: profiles.to_vec(),
        property_sources,
        state: None,
        version,
    }
}
