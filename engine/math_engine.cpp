#include "math_engine.h"

#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <stdexcept>
#include <string>

namespace {

// Dynamic high-precision evaluation functions for mathematical constants
double compute_pi() {
    return 4.0 * std::atan(1.0);
}

double compute_euler() {
    // Fast-converging series expansion: e = sum_{k=0}^{infinity} 1 / k!
    // 25 terms exceeds IEEE 754 double precision limit (53 bits, ~1.11e-16 epsilon)
    double sum = 0.0;
    double term = 1.0;
    for (int k = 1; k <= 25; ++k) {
        sum += term;
        term /= static_cast<double>(k);
    }
    return sum;
}

struct ParsedValue {
    double numeric;
    std::string exact;
    bool symbolic;
};

std::string number_text(double value) {
    char buffer[64]{};
    std::snprintf(buffer, sizeof(buffer), "%.15g", value);
    return buffer;
}

class Parser {
public:
    explicit Parser(const char* input) : input_(input), position_(0) {}

    ParsedValue parse() {
        skip_whitespace();
        if (at_end()) {
            throw std::runtime_error("Enter an expression");
        }
        ParsedValue value = parse_expression();
        skip_whitespace();
        if (!at_end()) {
            throw std::runtime_error("Unexpected character in expression");
        }
        return value;
    }

private:
    ParsedValue parse_expression() {
        ParsedValue value = parse_term();
        while (true) {
            skip_whitespace();
            const char operation = input_[position_];
            if (operation != '+' && operation != '-') {
                return value;
            }
            ++position_;
            const ParsedValue right = parse_term();
            value.numeric = operation == '+' ? value.numeric + right.numeric
                                             : value.numeric - right.numeric;
            value.symbolic = value.symbolic || right.symbolic;
            value.exact = value.symbolic
                ? "(" + value.exact + operation + right.exact + ")"
                : number_text(value.numeric);
        }
    }

    ParsedValue parse_term() {
        ParsedValue value = parse_unary();
        while (true) {
            skip_whitespace();
            const char operation = input_[position_];
            if (operation != '*' && operation != '/') {
                return value;
            }
            ++position_;
            const ParsedValue right = parse_unary();
            if (operation == '/' && right.numeric == 0.0) {
                throw std::runtime_error("Cannot divide by zero");
            }
            value.numeric = operation == '*' ? value.numeric * right.numeric
                                             : value.numeric / right.numeric;
            if (!std::isfinite(value.numeric)) {
                throw std::runtime_error("The result is not finite");
            }
            value.symbolic = value.symbolic || right.symbolic;
            value.exact = value.symbolic
                ? "(" + value.exact + operation + right.exact + ")"
                : number_text(value.numeric);
        }
    }

    ParsedValue parse_unary() {
        skip_whitespace();
        if (input_[position_] == '+') {
            ++position_;
            return parse_unary();
        }
        if (input_[position_] == '-') {
            ++position_;
            ParsedValue value = parse_unary();
            value.numeric = -value.numeric;
            value.exact = value.symbolic ? "-(" + value.exact + ")" : number_text(value.numeric);
            return value;
        }
        return parse_power();
    }

    ParsedValue parse_power() {
        ParsedValue value = parse_postfix();
        skip_whitespace();
        if (input_[position_] == '^') {
            ++position_;
            const ParsedValue exponent = parse_unary();
            value.numeric = std::pow(value.numeric, exponent.numeric);
            if (!std::isfinite(value.numeric)) {
                throw std::runtime_error("The result is not finite");
            }
            value.symbolic = value.symbolic || exponent.symbolic;
            value.exact = value.symbolic
                ? "(" + value.exact + "^" + exponent.exact + ")"
                : number_text(value.numeric);
        }
        return value;
    }

    ParsedValue parse_postfix() {
        ParsedValue value = parse_primary();
        while (true) {
            skip_whitespace();
            if (input_[position_] != '!') {
                return value;
            }
            ++position_;
            if (value.numeric < 0.0 || std::floor(value.numeric) != value.numeric ||
                value.numeric > 170.0) {
                throw std::runtime_error("Factorial requires an integer from 0 to 170");
            }
            double factorial = 1.0;
            for (int index = 2; index <= static_cast<int>(value.numeric); ++index) {
                factorial *= index;
            }
            value.numeric = factorial;
            value.exact = number_text(factorial);
            value.symbolic = false;
        }
    }

    ParsedValue parse_primary() {
        skip_whitespace();
        if (input_[position_] == '(') {
            ++position_;
            ParsedValue value = parse_expression();
            skip_whitespace();
            if (input_[position_] != ')') {
                throw std::runtime_error("Missing closing parenthesis");
            }
            ++position_;
            value.exact = "(" + value.exact + ")";
            return value;
        }
        if (match_word("sqrt")) {
            const ParsedValue argument = parse_function_argument("sqrt");
            if (argument.numeric < 0.0) {
                throw std::runtime_error("Cannot take the square root of a negative value");
            }
            const double result = std::sqrt(argument.numeric);
            const bool exact = result == std::floor(result);
            return {result, exact ? number_text(result) : "sqrt(" + argument.exact + ")", !exact};
        }
        if (match_word("root")) {
            const ParsedValue index = parse_function_argument("root");
            const ParsedValue argument = parse_function_argument("root");
            if (index.numeric <= 0.0 || std::floor(index.numeric) != index.numeric) {
                throw std::runtime_error("Root index must be a positive integer");
            }
            if (argument.numeric < 0.0 && std::fmod(index.numeric, 2.0) == 0.0) {
                throw std::runtime_error("Even roots cannot contain a negative value");
            }
            const double root = std::pow(std::fabs(argument.numeric), 1.0 / index.numeric);
            if (!std::isfinite(root)) {
                throw std::runtime_error("The result is not finite");
            }
            const double result = argument.numeric < 0.0 ? -root : root;
            const bool exact = root == std::floor(root);
            return {result, exact ? number_text(result)
                                  : "root(" + index.exact + ")(" + argument.exact + ")", !exact};
        }
        const bool is_log = match_word("log");
        const bool is_ln = !is_log && match_word("ln");
        if (is_log || is_ln) {
            const std::string function = is_ln ? "ln" : "log";
            const ParsedValue first_argument = parse_function_argument(function.c_str());
            if (is_log) {
                skip_whitespace();
                if (input_[position_] == '(') {
                    const ParsedValue argument = parse_function_argument("log");
                    if (first_argument.numeric <= 0.0 || first_argument.numeric == 1.0 ||
                        argument.numeric <= 0.0) {
                        throw std::runtime_error("Logarithm base and value must be positive, and the base cannot be 1");
                    }
                    const double result = std::log(argument.numeric) /
                                          std::log(first_argument.numeric);
                    const bool exact = result == std::floor(result);
                    return {result, exact ? number_text(result)
                                          : "log(" + first_argument.exact + ")(" + argument.exact + ")", !exact};
                }
            }
            const ParsedValue argument = first_argument;
            if (argument.numeric <= 0.0) {
                throw std::runtime_error("Logarithms require a positive value");
            }
            const double result = function == "ln" ? std::log(argument.numeric)
                                                    : std::log10(argument.numeric);
            const bool exact = result == std::floor(result);
            return {result, exact ? number_text(result) : function + "(" + argument.exact + ")", !exact};
        }
        if (match_pi()) return {compute_pi(), "π", true};
        if (match_word("e")) return {compute_euler(), "e", true};

        char* end = nullptr;
        const double value = std::strtod(input_ + position_, &end);
        if (end == input_ + position_) {
            throw std::runtime_error("Expected a number");
        }
        if (!std::isfinite(value)) {
            throw std::runtime_error("The number is not finite");
        }
        position_ = static_cast<std::size_t>(end - input_);
        return {value, number_text(value), false};
    }

    ParsedValue parse_function_argument(const char* function) {
        skip_whitespace();
        if (input_[position_] != '(') {
            throw std::runtime_error(std::string(function) + " requires an expression in parentheses");
        }
        ++position_;
        ParsedValue value = parse_expression();
        skip_whitespace();
        if (input_[position_] != ')') {
            throw std::runtime_error("Missing closing parenthesis");
        }
        ++position_;
        return value;
    }

    bool match_pi() {
        skip_whitespace();
        if (input_[position_] == 'p' && input_[position_ + 1] == 'i') {
            if (!std::isalnum(static_cast<unsigned char>(input_[position_ + 2])) && input_[position_ + 2] != '_') {
                position_ += 2;
                return true;
            }
        }
        if (static_cast<unsigned char>(input_[position_]) == 0xCF &&
            static_cast<unsigned char>(input_[position_ + 1]) == 0x80) {
            position_ += 2;
            return true;
        }
        return false;
    }

    bool match_word(const char* word) {
        skip_whitespace();
        const std::size_t start = position_;
        for (std::size_t index = 0; word[index] != '\0'; ++index) {
            if (input_[position_] != word[index]) {
                position_ = start;
                return false;
            }
            ++position_;
        }
        if (std::isalnum(static_cast<unsigned char>(input_[position_]))) {
            position_ = start;
            return false;
        }
        return true;
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
        const ParsedValue parsed = Parser(expression).parse();
        MathResult result{};
        result.value = parsed.numeric;
        std::strncpy(result.exact_value, parsed.exact.c_str(), sizeof(result.exact_value) - 1);
        return result;
    } catch (const std::exception& error) {
        return failure(error.what());
    }
}
