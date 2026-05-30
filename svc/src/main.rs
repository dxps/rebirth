mod config;
mod crypto;
mod db;
mod dberr;
mod routes;
mod seed;
mod springconfig;
mod types;
mod validation;
mod web;

use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() {
    config::load_env_files();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let Some(database_url) = config::database_url() else {
        eprintln!("DATABASE_URL is not set; cannot start the service.");
        std::process::exit(1);
    };

    let pool = match PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
    {
        Ok(pool) => pool,
        Err(error) => {
            eprintln!("Failed to connect to the database: {error}");
            std::process::exit(1);
        }
    };

    if let Err(error) = sqlx::migrate!("./migrations").run(&pool).await {
        eprintln!("Failed to run database migrations: {error}");
        std::process::exit(1);
    }

    if let Err(error) = seed::run_seeding(&pool).await {
        eprintln!("Failed to seed initial data: {error}");
        std::process::exit(1);
    }

    let port = config::port();
    let app = routes::app(pool);

    let listener = match tokio::net::TcpListener::bind(("0.0.0.0", port)).await {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("Failed to bind to port {port}: {error}");
            std::process::exit(1);
        }
    };

    println!("{} API listening on http://localhost:{port}", types::APP_NAME);

    if let Err(error) = axum::serve(listener, app).await {
        eprintln!("Server error: {error}");
        std::process::exit(1);
    }
}
