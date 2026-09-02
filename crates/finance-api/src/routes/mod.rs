mod health;
mod portfolio;

use axum::Router;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .merge(health::router())
        .nest("/api/v1", portfolio::router())
}
