#include "math_engine.h"
#include "core/lexer.hpp"
#include "core/parser.hpp"

#include <algorithm>
#include <cstring>
#include <exception>
#include <string>

namespace {

template <std::size_t N>
void copy_text(char (&target)[N], const std::string& text) {
    const std::size_t length = std::min(text.size(), N - 1);
    std::memcpy(target, text.data(), length);
    target[length] = '\0';
}

MathResult error_result(const char* message) {
    MathResult result{};
    result.error_code = 1;
    copy_text(result.error_message, message);
    return result;
}

} // namespace

extern "C" MathResult evaluate_expression(const char* expression) {
    if (expression == nullptr || expression[0] == '\0') return error_result("Enter an expression");

    try {
        lluna::core::Parser parser(lluna::core::Lexer(expression).tokenize());
        const lluna::core::NumberValue value = parser.parse()->evaluate();

        MathResult result{};
        result.is_approximate = value.is_approximate() ? 1 : 0;
        result.value = value.to_double();
        copy_text(result.exact_value, value.exact_string());
        copy_text(result.display_value, value.format());
        return result;
    } catch (const std::exception& error) {
        return error_result(error.what());
    }
}
