cmake_minimum_required(VERSION 3.20)
project(lluna_math_engine_tests LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(lluna_math_engine math_engine.cpp)
target_include_directories(lluna_math_engine PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")

add_executable(math_engine_tests math_engine_test.cpp)
target_link_libraries(math_engine_tests PRIVATE lluna_math_engine)

enable_testing()
add_test(NAME math_engine_tests COMMAND math_engine_tests)
