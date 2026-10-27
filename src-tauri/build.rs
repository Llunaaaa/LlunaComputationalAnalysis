fn main() {
    println!("cargo:rerun-if-changed=../engine/math_engine.cpp");
    println!("cargo:rerun-if-changed=../engine/math_engine.h");

    cc::Build::new()
        .cpp(true)
        .file("../engine/math_engine.cpp")
        .include("../engine")
        .warnings(true)
        .compile("lluna_math_engine");

    tauri_build::build();
}
