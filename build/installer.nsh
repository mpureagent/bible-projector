; T7-package（R7a）：显式钉默认安装目录 $PROGRAMFILES64\圣言投屏。
; electron-builder 的 NSIS 脚本在 .onInit 中先执行 preInit 宏，再据 ${INSTALL_REGISTRY_KEY}
; 的 InstallLocation 决定默认目录；此处抢先写入该键 → 默认目录恒为 Program Files 下的
; 圣言投屏，忽略并覆盖旧卸载残留键（如 D:\important 之类历史值）。
!macro preInit
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES64\圣言投屏"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES64\圣言投屏"
!macroend