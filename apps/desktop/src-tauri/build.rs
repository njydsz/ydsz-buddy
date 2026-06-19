fn main() {
    // Ensure remi-server binary is built before Tauri bundles the app
    println!("cargo:warning=Building remi-server backend...");
    
    // Build the remi-server binary
    let status = std::process::Command::new("cargo")
        .args(&["build", "-p", "remi-server"])
        .status()
        .expect("Failed to build remi-server");
    
    if !status.success() {
        panic!("Failed to build remi-server backend");
    }
    
    // Copy to resources/bin for Tauri bundling
    let profile = if cfg!(debug_assertions) { "debug" } else { "release" };
    let src = format!("../../../target/{}/remi-server", profile);
    let dst = "resources/bin/remi-server";
    
    // Create directory if it doesn't exist
    std::fs::create_dir_all("resources/bin").ok();
    
    // Copy the binary (with platform extension on Windows)
    #[cfg(target_os = "windows")]
    {
        let src_exe = format!("{}.exe", src);
        let dst_exe = format!("{}.exe", dst);
        if std::path::Path::new(&src_exe).exists() {
            std::fs::copy(&src_exe, &dst_exe).ok();
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        if std::path::Path::new(&src).exists() {
            std::fs::copy(&src, dst).ok();
        }
    }
    
    tauri_build::build()
}
