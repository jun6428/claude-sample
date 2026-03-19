#!/bin/bash
# 新しいゲームを作成し、開いているChromeウィンドウ全てにゲームURLを展開する

GAME_ID=$(curl -s -X POST http://localhost:8000/api/games | python3 -c "import sys,json; print(json.load(sys.stdin)['game_id'])")

if [ -z "$GAME_ID" ]; then
  echo "Failed to create game. Is the backend running?"
  exit 1
fi

echo "Created game: $GAME_ID"
echo "URL: http://localhost:3000/game/$GAME_ID"

osascript << EOF
tell application "Google Chrome"
  set gameURL to "http://localhost:3000/game/$GAME_ID"
  set playerNames to {"p1", "p2", "p3", "p4"}
  repeat with i from 1 to count of windows
    make new tab at end of tabs of window i
    set URL of last tab of window i to gameURL
  end repeat
end tell
EOF

echo "Waiting for pages to load..."
sleep 3

osascript << EOF
tell application "Google Chrome"
  set playerNames to {"p1", "p2", "p3", "p4"}
  set winCount to count of windows
  if winCount > 4 then set winCount to 4
  repeat with i from 1 to winCount
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
    execute last tab of window i javascript js
  end repeat
end tell
EOF

echo "Joined as p1-p4."
