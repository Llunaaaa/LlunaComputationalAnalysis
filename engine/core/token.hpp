#pragma once

#include <string>

namespace lluna::core {

enum class TokenType {
    Number,
    Identifier,
    Plus,
    Minus,
    Star,
    Slash,
    Caret,
    Exclamation,
    LParen,
    RParen,
    Comma,
    Eof
};

struct Token {
    TokenType type;
    double number_value = 0.0;
    std::string text;
    std::size_t position = 0;

    static Token make_number(double val, const std::string& str, std::size_t pos) {
        Token t;
        t.type = TokenType::Number;
        t.number_value = val;
        t.text = str;
        t.position = pos;
        return t;
    }

    static Token make(TokenType type, const std::string& str, std::size_t pos) {
        Token t;
        t.type = type;
        t.text = str;
        t.position = pos;
        return t;
    }
};

} // namespace lluna::core
