mod health;
mod internal;
mod portfolio;

use axum::Router;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .merge(health::router())
        .merge(internal::router())
        .nest("/api/v1", portfolio::router())
}
