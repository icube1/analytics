mod auth;
mod billing;
mod health;
mod internal;
mod jobs;
mod portfolio;

use axum::middleware::from_fn_with_state;
use axum::Router;

use crate::auth::require_session;
use crate::state::AppState;

pub fn router(state: &AppState) -> Router<AppState> {
    let session_layer = from_fn_with_state(state.clone(), require_session);
    let auth_protected = auth::protected_router().layer(session_layer.clone());
    let protected = Router::new()
        .merge(portfolio::router())
        .merge(jobs::router())
        .layer(session_layer);

    Router::new()
        .merge(health::router())
        .merge(internal::router())
        .nest("/api/v1/auth", auth::public_router().merge(auth_protected))
        .nest("/api/v1", protected)
        .nest("/api/v1", billing::router())
}
