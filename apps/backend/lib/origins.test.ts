import { describe, expect, test } from "bun:test";
import { parseAllowedOrigins } from "./origins";

describe("parseAllowedOrigins", () => {
    test("defaults to the local frontend", () => {
        expect(parseAllowedOrigins(undefined)).toEqual(["http://localhost:3000"]);
        expect(parseAllowedOrigins(" , ")).toEqual(["http://localhost:3000"]);
    });

    test("splits a list and drops trailing slashes", () => {
        expect(parseAllowedOrigins("https://app.example.com/, https://fitfortherole.pages.dev")).toEqual([
            "https://app.example.com",
            "https://fitfortherole.pages.dev",
        ]);
    });
});
