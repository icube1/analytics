use crate::auth::{Authenticated, SESSION_COOKIE};
use crate::config::Environment;
use crate::error::{ApiError, ApiResult};
use crate::repositories::{
    hash_audit_identifier, ClientKind, HouseholdRepository, MembershipRepository, UserRepository,
    ACTION_AUTH_LOGIN, ACTION_AUTH_LOGIN_FAILED, ACTION_AUTH_LOGOUT,
};
use crate::state::AppState;
use axum::{
    extract::{Extension, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use serde::{Deserialize, Serialize};
use time::Duration;
use uuid::Uuid;

pub fn public_router() -> Router<AppState> {
    Router::new().route("/login", post(login))
}
pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/logout", post(logout))
        .route("/me", get(me))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginRequest {
    email: String,
    password: String,
    household_id: Option<Uuid>,
    client_kind: Option<String>,
    rotate_session_id: Option<Uuid>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoginResponse {
    user_id: String,
    household_id: String,
    csrf_token: String,
    bearer_token: Option<String>,
    expires_at: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MeResponse {
    user_id: String,
    email: Option<String>,
    display_name: String,
    household_id: String,
    household_name: String,
    role: String,
    session_id: String,
    expires_at: String,
}

async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<LoginRequest>,
) -> ApiResult<(StatusCode, CookieJar, Json<LoginResponse>)> {
    if state.config().environment == Environment::Production && !state.config().local_auth_enabled()
    {
        return Err(ApiError::AuthNotConfigured);
    }
    let ck = body
        .client_kind
        .as_deref()
        .and_then(ClientKind::parse)
        .unwrap_or(ClientKind::Web);
    let created = match state
        .auth()
        .login(
            body.email.trim(),
            &body.password,
            body.household_id,
            ck,
            body.rotate_session_id,
        )
        .await
    {
        Ok(created) => created,
        Err(error) => {
            state
                .audit()
                .record_best_effort(
                    None,
                    None,
                    ACTION_AUTH_LOGIN_FAILED,
                    serde_json::json!({
                        "emailHash": hash_audit_identifier(body.email.trim()),
                        "clientKind": ck.as_str(),
                    }),
                )
                .await;
            return Err(error);
        }
    };
    state
        .audit()
        .record_best_effort(
            Some(created.record.household_id),
            Some(created.record.user_id),
            ACTION_AUTH_LOGIN,
            serde_json::json!({ "clientKind": ck.as_str() }),
        )
        .await;
    let mut resp = LoginResponse {
        user_id: created.record.user_id.to_string(),
        household_id: created.record.household_id.to_string(),
        csrf_token: created.record.csrf_token.clone(),
        bearer_token: created.bearer_token.clone(),
        expires_at: created.record.expires_at.to_rfc3339(),
    };
    let mut jar = jar;
    if ck == ClientKind::Web {
        jar = jar.add(session_cookie(
            &state,
            &created.session_token,
            created.record.expires_at,
        ));
        resp.bearer_token = None;
    }
    Ok((StatusCode::OK, jar, Json(resp)))
}
async fn logout(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
    jar: CookieJar,
) -> ApiResult<(StatusCode, CookieJar, Json<serde_json::Value>)> {
    state.auth().logout(auth.session.id).await?;
    state
        .audit()
        .record_best_effort(
            Some(auth.context.household_id),
            Some(auth.context.user_id),
            ACTION_AUTH_LOGOUT,
            serde_json::json!({ "sessionId": auth.session.id.to_string() }),
        )
        .await;
    Ok((
        StatusCode::OK,
        jar.remove(
            Cookie::build((SESSION_COOKIE, ""))
                .path("/")
                .http_only(true)
                .secure(state.config().session_cookie_secure)
                .same_site(SameSite::Lax)
                .max_age(Duration::seconds(0)),
        ),
        Json(serde_json::json!({"ok": true})),
    ))
}
async fn me(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
) -> ApiResult<Json<MeResponse>> {
    let user = UserRepository::new(state.pool().clone())
        .get_by_id(auth.context.user_id)
        .await?;
    let hh = HouseholdRepository::new(state.pool().clone())
        .get_by_id(auth.context.household_id)
        .await?;
    let m = MembershipRepository::new(state.pool().clone())
        .get_member(auth.scope(), auth.context.user_id)
        .await?;
    Ok(Json(MeResponse {
        user_id: user.id.to_string(),
        email: user.email,
        display_name: user.display_name,
        household_id: hh.id.to_string(),
        household_name: hh.name,
        role: m.role.as_str().to_owned(),
        session_id: auth.session.id.to_string(),
        expires_at: auth.session.expires_at.to_rfc3339(),
    }))
}
fn session_cookie(
    state: &AppState,
    token: &str,
    exp: chrono::DateTime<chrono::Utc>,
) -> Cookie<'static> {
    Cookie::build((SESSION_COOKIE, token.to_owned()))
        .path("/")
        .http_only(true)
        .secure(state.config().session_cookie_secure)
        .same_site(SameSite::Lax)
        .max_age(Duration::seconds(
            (exp - chrono::Utc::now()).num_seconds().max(0),
        ))
        .build()
}
