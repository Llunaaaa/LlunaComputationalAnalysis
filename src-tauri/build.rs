fn main() {
    // Directories are tracked recursively, so every engine header is covered.
    println!("cargo:rerun-if-changed=../engine");

    cc::Build::new()
        .cpp(true)
        .std("c++17")
        .file("../engine/math_engine.cpp")
        .include("../engine")
        .warnings(true)
        .compile("lluna_math_engine");

    tauri_build::build();
}
