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
        skip_whitespace();
        if (at_end()) {
            throw std::runtime_error("Enter an expression");
        }
        const double value = parse_expression();
        skip_whitespace();
        if (!at_end()) {
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
        double value = parse_unary();
        while (true) {
            skip_whitespace();
            const char operation = input_[position_];
            if (operation != '*' && operation != '/') {
                return value;
            }
            ++position_;
            const double right = parse_unary();
            if (operation == '/' && right == 0.0) {
                throw std::runtime_error("Cannot divide by zero");
            }
            value = operation == '*' ? value * right : value / right;
        }
    }

    double parse_unary() {
        skip_whitespace();
        if (input_[position_] == '+') {
            ++position_;
            return parse_unary();
        }
        if (input_[position_] == '-') {
            ++position_;
            return -parse_unary();
        }
        return parse_power();
    }

    double parse_power() {
        double value = parse_primary();
        skip_whitespace();
        if (input_[position_] == '^') {
            ++position_;
            const double exponent = parse_unary();
            value = std::pow(value, exponent);
            if (!std::isfinite(value)) {
                throw std::runtime_error("The result is not finite");
            }
        }
        return value;
    }

    double parse_primary() {
        skip_whitespace();
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

        if (match_function("sqrt")) {
            const double value = parse_function_argument("sqrt");
            if (value < 0.0) {
                throw std::runtime_error("Cannot take the square root of a negative value");
            }
            return std::sqrt(value);
        }

        if (match_function("root")) {
            const double index = parse_function_argument("root");
            skip_whitespace();
            if (input_[position_] != '(') {
                throw std::runtime_error("Root requires an expression in parentheses");
            }
            ++position_;
            const double value = parse_expression();
            skip_whitespace();
            if (input_[position_] != ')') {
                throw std::runtime_error("Missing closing parenthesis");
            }
            ++position_;
            if (!std::isfinite(index) || index <= 0.0 ||
                std::floor(index) != index) {
                throw std::runtime_error("Root index must be a positive integer");
            }
            if (value < 0.0 && std::fmod(index, 2.0) == 0.0) {
                throw std::runtime_error("Even roots cannot contain a negative value");
            }
            const double result = std::pow(std::fabs(value), 1.0 / index);
            return value < 0.0 ? -result : result;
        }

        char* end = nullptr;
        const double value = std::strtod(input_ + position_, &end);
        if (end == input_ + position_) {
            throw std::runtime_error("Expected a number");
        }
        if (!std::isfinite(value)) {
            throw std::runtime_error("The number is not finite");
        }
        position_ = static_cast<std::size_t>(end - input_);
        return value;
    }

    bool match_function(const char* name) {
        skip_whitespace();
        const std::size_t start = position_;
        for (std::size_t index = 0; name[index] != '\0'; ++index) {
            if (input_[position_] != name[index]) {
                position_ = start;
                return false;
            }
            ++position_;
        }
        if (std::isalnum(static_cast<unsigned char>(input_[position_])) ||
            input_[position_] == '_') {
            position_ = start;
            return false;
        }
        return true;
    }

    double parse_function_argument(const char* function_name) {
        skip_whitespace();
        if (input_[position_] != '(') {
            throw std::runtime_error(std::string(function_name) +
                                     " requires an expression in parentheses");
        }
        ++position_;
        const double value = parse_expression();
        skip_whitespace();
        if (input_[position_] != ')') {
            throw std::runtime_error("Missing closing parenthesis");
        }
        ++position_;
        return value;
    }

    void skip_whitespace() {
        while (std::isspace(static_cast<unsigned char>(input_[position_]))) {
            ++position_;
        }
    }

    bool at_end() const { return input_[position_] == '\0'; }

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
