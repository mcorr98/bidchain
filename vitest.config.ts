import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "."),
        },
    },
    test: {
        env: {
            DATABASE_URL: "postgresql://michealcorr@localhost:5432/bidchain_test",
            NEXT_PUBLIC_APP_URL: "http://localhost:3000",
            RECORD_SIGNING_KEY: "MC4CAQAwBQYDK2VwBCIEIIG6/9oVD+Yqvu5ixMf1TI8cfLBPcb8G76pDFpatXfFw",
            RECORD_SIGNING_PUBLIC_KEY: "MCowBQYDK2VwAyEAYDvT1b8HZFu8CbzESBsjpJ7i+WmAbgjURSC+FbS5mHk=",

        },
        coverage: {
            provider: "v8",
            include: ["lib/**/*.ts"],
            exclude: ["lib/**/*.test.ts", "lib/types.ts"],
        },
    },
});