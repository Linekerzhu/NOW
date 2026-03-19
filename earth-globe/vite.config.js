import glsl from 'vite-plugin-glsl';

export default {
  plugins: [glsl()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
};
