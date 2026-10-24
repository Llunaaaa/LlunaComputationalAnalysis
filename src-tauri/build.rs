fn main() {
    cc::Build::new()
        .cpp(true)
        .file("../engine/math_engine.cpp")
        .include("../engine")
        .warnings(true)
        .compile("lluna_math_engine");

    tauri_build::build();
}
