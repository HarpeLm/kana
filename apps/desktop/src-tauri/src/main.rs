// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match kana_core::parse_cli_args(&args) {
        Ok(kana_core::CliCommand::Gui) => desktop_lib::run(),
        Ok(cmd) => std::process::exit(desktop_lib::run_cli(cmd)),
        Err(err) => {
            eprintln!("Erreur CLI Kana : {err}");
            std::process::exit(2);
        }
    }
}
