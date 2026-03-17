#!/bin/bash
# 新しいゲームを作成し、セットアップを自動完了してすぐ playing フェーズで遊べる状態にする

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_PYTHON="$SCRIPT_DIR/../backend/venv/bin/python3"

GAME_ID=$(curl -s -X POST http://localhost:8000/api/games | python3 -c "import sys,json; print(json.load(sys.stdin)['game_id'])")

if [ -z "$GAME_ID" ]; then
  echo "Failed to create game. Is the backend running?"
  exit 1
fi

echo "Created game: $GAME_ID"

# セットアップ自動完了
echo "Running auto setup..."
"$VENV_PYTHON" "$SCRIPT_DIR/auto-setup.py" "$GAME_ID"
if [ $? -ne 0 ]; then
  echo "Auto setup failed."
  exit 1
fi

# Chrome を開いてゲーム画面に遷移
osascript << EOF
tell application "Google Chrome"
  set gameURL to "http://localhost:3000/game/$GAME_ID"
  repeat with i from 1 to count of windows
    set URL of tab 1 of window i to gameURL
  end repeat
end tell
EOF

echo "Waiting for pages to load..."
sleep 3

# 各ウィンドウに p1〜p4 で自動参加
osascript << EOF
tell application "Google Chrome"
  set playerNames to {"p1", "p2", "p3", "p4"}
  repeat with i from 1 to count of windows
    set pname to item i of playerNames
    set js to "
      const input = document.querySelector('input[placeholder*=\"プレイヤー名\"]');
      if (input) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(input, '" & pname & "');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => {
          const btn = document.querySelector('button');
          if (btn) btn.click();
        }, 300);
      }
    "
    execute tab 1 of window i javascript js
  end repeat
end tell
EOF

echo "Ready! Joined as p1-p4 in playing phase."
