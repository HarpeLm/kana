use thiserror::Error;

#[derive(Debug, Error)]
pub enum AcpError {
    #[error("impossible de lancer l'agent : {0}")]
    Spawn(#[source] std::io::Error),
    #[error("erreur d'entrée/sortie : {0}")]
    Io(#[from] std::io::Error),
    #[error("l'agent a répondu avec une erreur ({code}) : {message}")]
    Rpc { code: i64, message: String },
    #[error("l'agent s'est arrêté")]
    Closed,
    #[error("réponse inattendue de l'agent : {0}")]
    Protocol(String),
}
