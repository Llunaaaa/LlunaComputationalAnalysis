fn main() {
    println!("cargo:rerun-if-changed=../engine/math_engine.cpp");
    println!("cargo:rerun-if-changed=../engine/math_engine.h");
    println!("cargo:rerun-if-changed=../engine/constants/constants.hpp");
    println!("cargo:rerun-if-changed=../engine/functions/functions.hpp");
    println!("cargo:rerun-if-changed=../engine/core/token.hpp");
    println!("cargo:rerun-if-changed=../engine/core/number_value.hpp");
    println!("cargo:rerun-if-changed=../engine/core/lexer.hpp");
    println!("cargo:rerun-if-changed=../engine/core/ast.hpp");
    println!("cargo:rerun-if-changed=../engine/core/parser.hpp");

    cc::Build::new()
        .cpp(true)
        .file("../engine/math_engine.cpp")
        .include("../engine")
        .warnings(true)
        .compile("lluna_math_engine");

    tauri_build::build();
}
