/** @type {import('vite').UserConfig} */
export default {
    base: './',
    build: {
        sourcemap: true,
    },
    define: {
        '__APP_VERSION__': JSON.stringify(process.env.npm_package_version),
    },
};
