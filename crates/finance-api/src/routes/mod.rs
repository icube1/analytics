mod audit;
mod auth;
mod billing;
mod broker_imports;
mod export;
mod health;
mod internal;
mod jobs;
mod portfolio;
mod statements;
mod usage;

use axum::middleware::from_fn_with_state;
use axum::Router;

use crate::auth::require_session;
use crate::state::AppState;

pub fn router(state: &AppState) -> Router<AppState> {
    let session_layer = from_fn_with_state(state.clone(), require_session);
    let auth_protected = auth::protected_router().layer(session_layer.clone());
    let protected = Router::new()
        .merge(portfolio::router())
        .merge(audit::router())
        .merge(usage::router())
        .merge(jobs::router())
        .merge(statements::router())
        .merge(broker_imports::router())
        .merge(export::router())
        .merge(billing::checkout_router())
        .layer(session_layer);

    Router::new()
        .merge(health::router())
        .merge(internal::router())
        .nest("/api/v1/auth", auth::public_router().merge(auth_protected))
        .nest("/api/v1", protected)
        .nest("/api/v1", billing::webhook_router())
}
