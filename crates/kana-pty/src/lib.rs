//! Shell dans un pseudo-terminal : lance un programme, relaie sa sortie et accepte la saisie.

use std::{
    io::{Read, Write},
    path::Path,
    thread,
};

use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PtyError {
    #[error("terminal : {0}")]
    Pty(String),
    #[error("erreur d'entrée/sortie : {0}")]
    Io(#[from] std::io::Error),
}

fn pty_error(error: impl std::fmt::Display) -> PtyError {
    PtyError::Pty(error.to_string())
}

fn size(rows: u16, cols: u16) -> PtySize {
    PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }
}

/// Un programme qui tourne dans un pseudo-terminal. Le programme est arrêté quand on le lâche.
pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

impl PtySession {
    /// Lance `program` dans `cwd`. `on_data` reçoit chaque morceau de sortie (octets bruts, une
    /// séquence UTF-8 peut être coupée entre deux appels) ; `on_exit` est appelé une fois à la fin.
    pub fn spawn(
        program: &str,
        args: &[&str],
        cwd: &Path,
        rows: u16,
        cols: u16,
        mut on_data: impl FnMut(&[u8]) + Send + 'static,
        on_exit: impl FnOnce() + Send + 'static,
    ) -> Result<Self, PtyError> {
        let pair = native_pty_system().openpty(size(rows, cols)).map_err(pty_error)?;

        let mut command = CommandBuilder::new(program);
        command.args(args);
        command.cwd(cwd);
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");

        let child = pair.slave.spawn_command(command).map_err(pty_error)?;
        // Sans cela, la lecture ne se termine jamais quand le programme s'arrête.
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader().map_err(pty_error)?;
        let writer = pair.master.take_writer().map_err(pty_error)?;

        thread::spawn(move || {
            let mut buffer = [0u8; 8192];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(count) => on_data(&buffer[..count]),
                }
            }
            on_exit();
        });

        Ok(Self { master: pair.master, writer, child })
    }

    /// Envoie de la saisie au programme.
    pub fn write(&mut self, data: &[u8]) -> Result<(), PtyError> {
        self.writer.write_all(data)?;
        self.writer.flush()?;
        Ok(())
    }

    /// Adapte le terminal à la taille de la fenêtre d'affichage.
    pub fn resize(&self, rows: u16, cols: u16) -> Result<(), PtyError> {
        self.master.resize(size(rows, cols)).map_err(pty_error)
    }
}

impl Drop for PtySession {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{Arc, Mutex, mpsc},
        time::{Duration, Instant},
    };

    use super::*;

    fn collector() -> (Arc<Mutex<Vec<u8>>>, impl FnMut(&[u8]) + Send + 'static) {
        let output = Arc::new(Mutex::new(Vec::new()));
        let sink = output.clone();
        (output, move |bytes: &[u8]| sink.lock().unwrap().extend_from_slice(bytes))
    }

    fn wait_for(output: &Arc<Mutex<Vec<u8>>>, needle: &str) -> bool {
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if String::from_utf8_lossy(&output.lock().unwrap()).contains(needle) {
                return true;
            }
            thread::sleep(Duration::from_millis(20));
        }
        false
    }

    #[test]
    fn program_output_reaches_the_callback_and_exit_is_reported() {
        let (output, on_data) = collector();
        let (done, exited) = mpsc::channel();
        let _session = PtySession::spawn(
            "sh",
            &["-c", "printf bonjour"],
            &std::env::temp_dir(),
            24,
            80,
            on_data,
            move || done.send(()).unwrap(),
        )
        .unwrap();

        exited.recv_timeout(Duration::from_secs(5)).expect("sortie non signalée");
        assert!(wait_for(&output, "bonjour"));
    }

    #[test]
    fn typed_input_reaches_the_program() {
        let (output, on_data) = collector();
        let mut session =
            PtySession::spawn("cat", &[], &std::env::temp_dir(), 24, 80, on_data, || {}).unwrap();

        session.write(b"salut\n").unwrap();
        assert!(wait_for(&output, "salut"));
    }

    #[test]
    fn resize_is_accepted() {
        let (_output, on_data) = collector();
        let session =
            PtySession::spawn("cat", &[], &std::env::temp_dir(), 24, 80, on_data, || {}).unwrap();
        session.resize(40, 120).unwrap();
    }

    #[test]
    fn missing_program_is_an_error() {
        let (_output, on_data) = collector();
        let result = PtySession::spawn(
            "kana-programme-inexistant",
            &[],
            &std::env::temp_dir(),
            24,
            80,
            on_data,
            || {},
        );
        assert!(result.is_err());
    }
}
