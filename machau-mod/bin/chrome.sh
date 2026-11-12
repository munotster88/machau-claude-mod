#!/bin/zsh
# Drive your real Chrome (your sign-ins) through AppleScript: the same route as the "Control Chrome" extension,
# usable from any harness's shell. Needs Chrome > View > Developer > "Allow JavaScript from Apple Events" (on).
# House rule: never bring Chrome to the front, never move the tab you are on, one tab per website.
#   chrome.sh open URL            load URL in Claude's own BACKGROUND tab for that website: the tab already opened for
#                                 that site is reused, otherwise one new tab is added at the end of your regular
#                                 window. your tab stays in front and the app you are in keeps the front (a first tab
#                                 for a site raises Chrome for a moment; it is handed straight back). Later commands use this tab.
#   chrome.sh url                 address of Claude's tab (your front tab if this session opened nothing, or after `here`)
#   chrome.sh text [N]            first N (default 3000) characters of the page text
#   chrome.sh js 'CODE'           run JavaScript in the tab, print its result
#   chrome.sh click 'Label'       click the button/link whose text or label is Label (reaches Amazon kat-* shadow buttons)
#   chrome.sh close               close Claude's tab when the work is finished
#   chrome.sh here                switch this session back to your front tab (to read what you are looking at)
#   chrome.sh tabs                list every tab as "window.tab  address" (the front window is 1)
# Secrets on a page: pipe `chrome.sh js` straight into pbcopy or a script; never print them.
STATE="$HOME/.local/state/chrome-sh"; mkdir -p "$STATE"
CUR="$STATE/cur-${CLAUDE_CODE_SESSION_ID:-shared}"

# One AppleScript for every action on a tab, found by its Chrome tab id ("front" = your active tab).
tab() { osascript - "$@" <<'OSA'
on run argv
  set act to item 1 of argv
  set tid to item 2 of argv
  set arg to ""
  if (count of argv) > 2 then set arg to item 3 of argv
  -- Chrome pulls itself to the front when a tab is made or its address is set from outside (measured 12 Nov 2026).
  -- So those two steps note which app the person is in and hand the front straight back to it.
  set fp to ""
  if act is "new" or act is "seturl" then
    tell application "System Events" to set fp to name of first process whose frontmost is true
  end if
  set res to my work(act, tid, arg)
  if fp is not "" and fp is not "Google Chrome" then
    try
      tell application fp to activate
    end try
  end if
  return res
end run

on work(act, tid, arg)
  tell application "Google Chrome"
    if act is "new" then
      if (count of (every window whose mode is "normal")) is 0 then
        make new window
        set URL of active tab of front window to arg
        return (id of active tab of front window) as text
      end if
      set w to first window whose mode is "normal"
      set keep to active tab index of w
      set t to make new tab at end of tabs of w with properties {URL:arg}
      set active tab index of w to keep
      return (id of t) as text
    end if
    set target to missing value
    if tid is "front" then
      set target to active tab of front window
    else
      repeat with w in windows
        repeat with t in tabs of w
          if ((id of t) as text) is tid then
            set target to contents of t
            exit repeat
          end if
        end repeat
        if target is not missing value then exit repeat
      end repeat
    end if
    if target is missing value then return "NO_TAB"
    if act is "exists" then return "yes"
    if act is "url" then return URL of target
    if act is "seturl" then
      set URL of target to arg
      return "ok"
    end if
    if act is "js" then return execute target javascript arg
    if act is "close" then
      close target
      return "closed"
    end if
  end tell
end work
OSA
}

# The tab this session works in: its own background tab if it opened one that still exists, else your front tab.
cur() { local id; id=$(cat "$CUR" 2>/dev/null); [ -n "$id" ] && [ "$(tab exists "$id")" = yes ] && echo "$id" || echo front; }
js() { tab js "$(cur)" "$1"; }

case "$1" in
  open)
    host=$(python3 -c 'import sys,urllib.parse as u; print(u.urlparse(sys.argv[1]).netloc.replace(":","_") or "nohost")' "$2")
    id=$(cat "$STATE/host-$host" 2>/dev/null)
    if [ -n "$id" ] && [ "$(tab exists "$id")" = yes ]; then
      # Moving on from inside the page does not raise Chrome; setting the address from outside does (fallback only).
      [ "$(tab js "$id" "location.href=$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$2");1" 2>/dev/null)" = 1 ] || tab seturl "$id" "$2" >/dev/null
      echo "loaded in the background tab already open for $host"
    else
      id=$(tab new - "$2"); echo "$id" > "$STATE/host-$host"; echo "opened in a new background tab for $host"
    fi
    echo "$id" > "$CUR" ;;
  url) tab url "$(cur)" ;;
  text) js "document.body.innerText.slice(0,${2:-3000})" ;;
  js) js "$2" ;;
  click) js "(()=>{const want=$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$2");
    const els=[...document.querySelectorAll('a,button,[role=button],[role=link],kat-button,kat-link')].filter(e=>e.offsetParent!==null||e.getClientRects().length);
    const el=els.find(e=>(e.getAttribute('label')||e.textContent||'').trim()===want);
    if(!el) return 'not found: '+want;
    const inner=el.shadowRoot&&el.shadowRoot.querySelector('a,button');
    (inner||el).click(); return 'clicked '+el.tagName;})()" ;;
  close) id=$(cur); [ "$id" = front ] && { echo "no tab of Claude's own to close"; exit 0; }
    tab close "$id"; rm -f "$CUR"; grep -lx "$id" "$STATE"/host-* 2>/dev/null | xargs rm -f ;;
  here) rm -f "$CUR"; echo "now on your front tab" ;;
  tabs) osascript -e 'tell application "Google Chrome"
    set out to ""
    set wi to 0
    repeat with w in windows
      set wi to wi + 1
      set ti to 0
      repeat with t in tabs of w
        set ti to ti + 1
        set out to out & wi & "." & ti & "  " & (URL of t) & linefeed
      end repeat
    end repeat
    return out
  end tell' ;;
  *) sed -n 2,15p "$0"; exit 1 ;;
esac
