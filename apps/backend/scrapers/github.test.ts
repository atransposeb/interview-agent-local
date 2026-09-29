import { describe, expect, test } from "bun:test";
import { parseGithubUsername } from "./github";

describe("parseGithubUsername", () => {
    test.each([
        ["https://github.com/octocat", "octocat"],
        ["https://github.com/octocat/", "octocat"],
        ["github.com/octocat", "octocat"],
        ["http://www.github.com/octocat?tab=repositories", "octocat"],
        ["https://github.com/octocat/hello-world", "octocat"],
        ["  octocat  ", "octocat"],
        ["@octo-cat", "octo-cat"],
    ])("reads the username from %p", (input, expected) => {
        expect(parseGithubUsername(input)).toBe(expected);
    });

    test.each([
        [""],
        ["https://gitlab.com/octocat"],
        ["https://github.com/"],
        ["not a url"],
        ["https://github.com/-octocat"],
        ["octo--cat"],
    ])("rejects %p", (input) => {
        expect(parseGithubUsername(input)).toBeNull();
    });
});
