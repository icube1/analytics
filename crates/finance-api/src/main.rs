use finance_api::{build_app, config::Config, db, init_tracing, startup_banner, AppState};
use tokio::signal;
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    init_tracing();
    let config = Config::from_env()?;
    startup_banner(&config);
    let pool = db::connect(&config).await?;
    let state = AppState::new(pool, config.clone()).with_worker().await?;
    let app = build_app(state.clone());
    let listener = tokio::net::TcpListener::bind(&config.bind_addr).await?;
    info!(addr = %config.bind_addr, "listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(state))
        .await?;
    Ok(())
}

async fn shutdown_signal(state: AppState) {
    let ctrl_c = async {
        signal::ctrl_c().await.expect("ctrl-c");
    };
    #[cfg(unix)]
    let term = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .unwrap()
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();
    tokio::select! { () = ctrl_c => {}, () = term => {} }
    state.shutdown().await;
}
