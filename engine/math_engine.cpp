#include "math_engine.h"
#include "constants/constants.hpp"
#include "functions/functions.hpp"
#include "core/token.hpp"
#include "core/lexer.hpp"
#include "core/ast.hpp"
#include "core/parser.hpp"

#include <cstring>
#include <string>
#include <exception>

extern "C" MathResult evaluate_expression(const char* expression) {
    if (expression == nullptr || expression[0] == '\0') {
        MathResult result{};
        result.error_code = 1;
        result.is_approximate = 0;
        result.value = 0.0;
        std::strncpy(result.error_message, "Enter an expression", sizeof(result.error_message) - 1);
        return result;
    }

    try {
        std::string expr_str(expression);
        lluna::core::Lexer lexer(expr_str);
        auto tokens = lexer.tokenize();

        lluna::core::Parser parser(std::move(tokens));
        auto ast = parser.parse();

        auto eval_res = ast->evaluate();

        MathResult result{};
        result.error_code = 0;
        result.is_approximate = eval_res.is_approximate ? 1 : 0;
        result.value = eval_res.value;
        std::strncpy(result.exact_value, eval_res.exact_repr.c_str(), sizeof(result.exact_value) - 1);
        return result;
    } catch (const std::exception& error) {
        MathResult result{};
        result.error_code = 1;
        result.is_approximate = 0;
        result.value = 0.0;
        std::strncpy(result.error_message, error.what(), sizeof(result.error_message) - 1);
        return result;
    }
}
