/**
 * electron-builder configuration
 * https://www.electron.build/configuration
 */
module.exports = {
  appId: 'com.clawsuite.app',
  productName: 'ClawSuite',
  copyright: 'Copyright © 2026 ClawSuite',

  directories: {
    output: 'release',
    buildResources: 'assets',
  },

  files: [
    'dist/**/*',
    'electron/**/*',
    'assets/**/*',
    'workspace-daemon/dist/**/*',
    '!node_modules',
    '!src',
    '!.git',
  ],

  mac: {
    category: 'public.app-category.developer-tools',
    icon: 'assets/icon.icns',
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] },
    ],
    darkModeSupport: true,
    hardenedRuntime: true,
    gatekeeperAssess: false,
  },

  dmg: {
    title: 'ClawSuite',
    iconSize: 80,
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },

  win: {
    icon: 'assets/icon.ico',
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] },
    ],
  },

  nsis: {
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    deleteAppDataOnUninstall: false,
  },

  linux: {
    icon: 'assets/icon.png',
    target: ['AppImage', 'deb'],
    category: 'Development',
  },

  // Auto-update via GitHub Releases
  publish: {
    provider: 'github',
    owner: 'outsourc-e',
    repo: 'clawsuite',
    releaseType: 'release',
  },

  // Don't bundle node_modules — we load from the built Vite output
  asar: true,
  compression: 'maximum',
}
