#include "math_engine.h"

#include <cctype>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <stdexcept>
#include <string>

namespace {

class Parser {
public:
    explicit Parser(const char* input) : input_(input), position_(0) {}

    double parse() {
        const double value = parse_expression();
        skip_whitespace();
        if (input_[position_] != '\0') {
            throw std::runtime_error("Unexpected character in expression");
        }
        return value;
    }

private:
    double parse_expression() {
        double value = parse_term();
        while (true) {
            skip_whitespace();
            const char operation = input_[position_];
            if (operation != '+' && operation != '-') {
                return value;
            }
            ++position_;
            const double right = parse_term();
            value = operation == '+' ? value + right : value - right;
        }
    }

    double parse_term() {
        double value = parse_factor();
        while (true) {
            skip_whitespace();
            const char operation = input_[position_];
            if (operation != '*' && operation != '/') {
                return value;
            }
            ++position_;
            const double right = parse_factor();
            if (operation == '/' && right == 0.0) {
                throw std::runtime_error("Cannot divide by zero");
            }
            value = operation == '*' ? value * right : value / right;
        }
    }

    double parse_factor() {
        skip_whitespace();
        if (input_[position_] == '+') {
            ++position_;
            return parse_factor();
        }
        if (input_[position_] == '-') {
            ++position_;
            return -parse_factor();
        }
        if (input_[position_] == '(') {
            ++position_;
            const double value = parse_expression();
            skip_whitespace();
            if (input_[position_] != ')') {
                throw std::runtime_error("Missing closing parenthesis");
            }
            ++position_;
            return value;
        }

        char* end = nullptr;
        const double value = std::strtod(input_ + position_, &end);
        if (end == input_ + position_) {
            throw std::runtime_error("Expected a number");
        }
        position_ = static_cast<std::size_t>(end - input_);
        return value;
    }

    void skip_whitespace() {
        while (std::isspace(static_cast<unsigned char>(input_[position_]))) {
            ++position_;
        }
    }

    const char* input_;
    std::size_t position_;
};

MathResult failure(const char* message) {
    MathResult result{};
    result.error_code = 1;
    std::strncpy(result.error_message, message, sizeof(result.error_message) - 1);
    return result;
}

}  // namespace

extern "C" MathResult evaluate_expression(const char* expression) {
    if (expression == nullptr || expression[0] == '\0') {
        return failure("Enter an expression");
    }

    try {
        MathResult result{};
        result.value = Parser(expression).parse();
        if (!std::isfinite(result.value)) {
            return failure("The result is not finite");
        }
        return result;
    } catch (const std::exception& error) {
        return failure(error.what());
    }
}
