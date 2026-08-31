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

        },
        coverage: {
            provider: "v8",
            include: ["lib/**/*.ts"],
            exclude: ["lib/**/*.test.ts"],
        },
    },
});