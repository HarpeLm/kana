//! Affiche les changements d'un dépôt.
//! Usage : cargo run -p kana-git --example show -- [chemin]

fn main() {
    let path = std::env::args().nth(1).unwrap_or_else(|| ".".into());
    match kana_git::diff(std::path::Path::new(&path)) {
        Ok(report) => {
            println!("dépôt : {}", report.root);
            for file in &report.files {
                println!(
                    "{:>8?}  +{:<4} -{:<4} {}{}",
                    file.status,
                    file.additions,
                    file.deletions,
                    file.path,
                    if file.binary { "  (binaire ou volumineux)" } else { "" }
                );
            }
        }
        Err(error) => eprintln!("erreur : {error}"),
    }
}
