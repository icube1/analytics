use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::request::Parts;
use axum::http::HeaderMap;
use axum::middleware::Next;
use axum::response::Response;

use crate::auth::csrf::{requires_csrf, validate_csrf};
use crate::auth::service::AuthService;
use crate::auth::{AuthContext, TenantScope};
use crate::error::ApiError;
use crate::repositories::{MembershipRepository, SessionRecord};
use crate::state::AppState;

pub const SESSION_COOKIE: &str = "finance_session";

#[derive(Clone, Debug)]
pub struct Authenticated {
    pub context: AuthContext,
    pub session: SessionRecord,
    pub used_bearer: bool,
}

impl Authenticated {
    pub fn scope(&self) -> TenantScope {
        TenantScope::from(&self.context)
    }
}

pub async fn require_session(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> Result<Response, ApiError> {
    let (parts, body) = request.into_parts();
    let auth = resolve_authenticated(&state, &parts).await?;
    request = Request::from_parts(parts, body);
    request.extensions_mut().insert(auth);
    Ok(next.run(request).await)
}

pub async fn resolve_authenticated(
    state: &AppState,
    parts: &Parts,
) -> Result<Authenticated, ApiError> {
    let (session_token, bearer_token) = extract_tokens(&parts.headers);
    let session = state
        .auth()
        .resolve_session(session_token.as_deref(), bearer_token.as_deref())
        .await?;
    let used_bearer = bearer_token.is_some();

    if !used_bearer && requires_csrf(&parts.method) {
        validate_csrf(&parts.headers, &session.csrf_token)?;
    }

    let context = AuthService::auth_context_from_session(&session);
    MembershipRepository::new(state.pool().clone())
        .ensure_membership(TenantScope::from(&context), context.user_id)
        .await?;

    Ok(Authenticated {
        context,
        session,
        used_bearer,
    })
}

fn extract_tokens(headers: &HeaderMap) -> (Option<String>, Option<String>) {
    if let Some(bearer) = headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
    {
        return (None, Some(bearer));
    }

    let session_token = headers
        .get("cookie")
        .and_then(|value| value.to_str().ok())
        .and_then(|cookie| {
            cookie.split(';').find_map(|part| {
                part.trim()
                    .strip_prefix(&format!("{SESSION_COOKIE}="))
                    .map(str::to_owned)
            })
        });

    (session_token, None)
}
