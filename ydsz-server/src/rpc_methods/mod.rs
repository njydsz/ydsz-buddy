pub struct SshLspTransport;

impl SshLspTransport {
    pub async fn spawn(_conn_id: &str, _preset: &str) -> anyhow::Result<Self> {
        Ok(Self)
    }
}
