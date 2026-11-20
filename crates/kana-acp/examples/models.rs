//! Affiche les modèles que propose un agent : cargo run -p kana-acp --example models -- opencode
use kana_acp::{AcpClient, preset};

#[tokio::main]
async fn main() {
    let agent = std::env::args().nth(1).unwrap_or_else(|| "opencode".into());
    let spec = preset(&agent).unwrap_or_else(|| panic!("agent inconnu : {agent}"));
    let cwd = std::env::var_os("KANA_CWD").map(std::path::PathBuf::from).unwrap_or_else(std::env::temp_dir);
    match AcpClient::spawn(&spec, &cwd).await {
        Ok((client, _events)) => {
            let models = client.models();
            println!("courant : {:?}", models.current);
            for m in &models.available {
                println!("- {} ({})", m.name, m.id);
            }
        }
        Err(error) => eprintln!("erreur : {error}"),
    }
}
