#pragma once

#include <cstring>
#include <string>

namespace lluna::constants {

inline constexpr double kPi = 3.14159265358979323846;
inline constexpr double kE = 2.71828182845904523536;
inline constexpr double kPhi = 1.61803398874989484820;
inline constexpr double kLn10 = 2.30258509299404568402;

enum class ConstantId { Pi, E, Phi };

struct ConstantDefinition {
    const char* name;
    const char* symbol;
    ConstantId id;
};

inline constexpr ConstantDefinition kConstants[] = {
    {"pi", "π", ConstantId::Pi},
    {"π", "π", ConstantId::Pi},
    {"e", "e", ConstantId::E},
    {"phi", "ϕ", ConstantId::Phi},
    {"ϕ", "ϕ", ConstantId::Phi},
    {"φ", "ϕ", ConstantId::Phi},
};

inline const ConstantDefinition* find_constant(const std::string& name) {
    for (const auto& constant : kConstants) {
        if (name == constant.name) return &constant;
    }
    return nullptr;
}

inline bool is_constant_name(const std::string& name) {
    return find_constant(name) != nullptr;
}

} // namespace lluna::constants
