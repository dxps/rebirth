use axum::body::Body;
use axum::extract::Request;
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::middleware::Next;
use axum::response::Response;
use serde::Serialize;

const ALLOW_HEADERS: &str = "Authorization, Content-Type";
const ALLOW_METHODS: &str = "DELETE, GET, PATCH, OPTIONS, POST, PUT";
const ALLOW_ORIGIN: &str = "*";

fn apply_cors(headers: &mut HeaderMap) {
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static(ALLOW_HEADERS),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static(ALLOW_METHODS),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static(ALLOW_ORIGIN),
    );
}

/// Middleware that answers CORS preflight requests and adds the shared CORS
/// headers to every response, matching the `jsonHeaders` used by the Bun
/// service on all routes.
pub async fn cors_middleware(request: Request, next: Next) -> Response {
    if request.method() == Method::OPTIONS {
        let mut response = Response::builder()
            .status(StatusCode::NO_CONTENT)
            .body(Body::empty())
            .expect("valid empty response");
        apply_cors(response.headers_mut());
        return response;
    }

    let mut response = next.run(request).await;
    apply_cors(response.headers_mut());
    response
}

pub fn json<T: Serialize>(status: StatusCode, value: &T) -> Response {
    let body = serde_json::to_vec(value).unwrap_or_else(|_| b"{}".to_vec());
    let mut response = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body))
        .expect("valid json response");
    apply_cors(response.headers_mut());
    response
}

#[derive(Serialize)]
struct DataEnvelope<T: Serialize> {
    data: T,
}

pub fn data<T: Serialize>(status: StatusCode, value: T) -> Response {
    json(status, &DataEnvelope { data: value })
}

pub fn error(status: StatusCode, message: &str) -> Response {
    json(status, &serde_json::json!({ "error": message }))
}

pub fn no_content() -> Response {
    let mut response = Response::builder()
        .status(StatusCode::NO_CONTENT)
        .body(Body::empty())
        .expect("valid empty response");
    apply_cors(response.headers_mut());
    response
}

pub fn authentication_required() -> Response {
    let mut response = json(
        StatusCode::UNAUTHORIZED,
        &serde_json::json!({ "error": "Authentication required" }),
    );
    response.headers_mut().insert(
        header::WWW_AUTHENTICATE,
        HeaderValue::from_static("Bearer realm=\"Rebirth\""),
    );
    response
}

pub fn authorization_required() -> Response {
    error(StatusCode::FORBIDDEN, "Insufficient permissions")
}

pub fn unique_conflict() -> Response {
    json(
        StatusCode::CONFLICT,
        &serde_json::json!({
            "error": {
                "code": "unique_conflict",
                "message": "An entry with the same name already exists"
            }
        }),
    )
}

pub fn username_unique_conflict() -> Response {
    json(
        StatusCode::CONFLICT,
        &serde_json::json!({
            "error": {
                "code": "unique_conflict",
                "message": "The username already exists"
            }
        }),
    )
}

pub fn attribute_template_unique_conflict() -> Response {
    json(
        StatusCode::CONFLICT,
        &serde_json::json!({
            "error": {
                "code": "unique_conflict",
                "details": "An entry with the same name and description already exists.",
                "message": "Name and description not unique"
            }
        }),
    )
}
