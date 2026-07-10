package main

import (
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const hookMarker = "cbm-axi hook-"

func setupAgent(agent, binary string) (status, path string, err error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", "", err
	}
	switch agent {
	case "claude":
		path = filepath.Join(home, ".claude", "settings.json")
		return upsertJSONHooks(path, binary)
	case "codex":
		path = filepath.Join(home, ".codex", "hooks.json")
		status, _, err = upsertJSONHooks(path, binary)
		if err != nil {
			return "", path, err
		}
		configPath := filepath.Join(home, ".codex", "config.toml")
		if err := enableCodexHooks(configPath); err != nil {
			return "", path, err
		}
		return status, path, nil
	case "opencode":
		path = filepath.Join(home, ".config", "opencode", "plugins", "cbm-axi.ts")
		return upsertOpenCodePlugin(path, binary)
	default:
		return "", "", errors.New("unsupported agent: " + agent)
	}
}

func upsertJSONHooks(path, binary string) (string, string, error) {
	old, existed, err := readJSONMap(path)
	if err != nil {
		return "", path, err
	}
	root := cloneMap(old)
	start := setupShellQuote(binary) + " hook-start"
	end := setupShellQuote(binary) + " hook-end"
	upsertHook(root, "SessionStart", "startup|resume|clear|compact", start)
	upsertHook(root, "SessionEnd", "*", end)
	encoded, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return "", path, err
	}
	encoded = append(encoded, '\n')
	if existed {
		previous, _ := os.ReadFile(path)
		if string(previous) == string(encoded) {
			return "unchanged", path, nil
		}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", path, err
	}
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		return "", path, err
	}
	return "configured", path, nil
}

func readJSONMap(path string) (map[string]any, bool, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return map[string]any{}, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		return map[string]any{}, true, nil
	}
	var value map[string]any
	if err := json.Unmarshal(data, &value); err != nil {
		return nil, true, errors.New("cannot update " + collapseHome(path) + ": invalid JSON")
	}
	return value, true, nil
}

func upsertHook(root map[string]any, event, matcher, command string) {
	hooks, ok := root["hooks"].(map[string]any)
	if !ok {
		hooks = map[string]any{}
		root["hooks"] = hooks
	}
	entries, _ := hooks[event].([]any)
	owned := false
	for i, raw := range entries {
		entry, ok := raw.(map[string]any)
		if !ok || !hookOwned(entry, event) {
			continue
		}
		entries[i] = hookEntry(matcher, command)
		owned = true
		break
	}
	if !owned {
		entries = append(entries, hookEntry(matcher, command))
	}
	hooks[event] = entries
}

func hookEntry(matcher, command string) map[string]any {
	return map[string]any{
		"matcher": matcher,
		"hooks": []any{map[string]any{
			"type":    "command",
			"command": command,
		}},
	}
}

func hookOwned(entry map[string]any, event string) bool {
	entries, ok := entry["hooks"].([]any)
	if !ok {
		return false
	}
	want := hookMarker
	if event == "SessionEnd" {
		want += "end"
	} else {
		want += "start"
	}
	for _, raw := range entries {
		hook, ok := raw.(map[string]any)
		if ok && strings.Contains(stringValue(hook["command"]), want) {
			return true
		}
	}
	return false
}

func enableCodexHooks(path string) error {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		data = []byte("[features]\nhooks = true\n")
	} else if err != nil {
		return err
	} else {
		data = []byte(enableTomlFeature(string(data), "hooks", "true"))
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func enableTomlFeature(content, key, value string) string {
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	section := -1
	end := len(lines)
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "[features]" {
			section = i
			continue
		}
		if section >= 0 && i > section && strings.HasPrefix(trimmed, "[") {
			end = i
			break
		}
	}
	if section < 0 {
		content = strings.TrimRight(content, "\n")
		return content + "\n\n[features]\n" + key + " = " + value + "\n"
	}
	for i := section + 1; i < end; i++ {
		if strings.HasPrefix(strings.TrimSpace(lines[i]), key+" ") || strings.HasPrefix(strings.TrimSpace(lines[i]), key+"=") {
			lines[i] = key + " = " + value
			return strings.Join(lines, "\n")
		}
	}
	lines = append(lines[:end], append([]string{key + " = " + value}, lines[end:]...)...)
	return strings.Join(lines, "\n")
}

func upsertOpenCodePlugin(path, binary string) (string, string, error) {
	content := openCodePlugin(binary)
	previous, err := os.ReadFile(path)
	if err == nil {
		if string(previous) == content {
			return "unchanged", path, nil
		}
		if !strings.Contains(string(previous), "cbm-axi user hook") {
			return "", path, errors.New("refusing to overwrite unrelated OpenCode plugin: " + collapseHome(path))
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", path, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", path, err
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return "", path, err
	}
	return "configured", path, nil
}

func openCodePlugin(binary string) string {
	quoted := strconvQuoteJS(binary)
	return "// cbm-axi user hook\n" +
		"const BIN = " + quoted + ";\n" +
		"function run(args = []) {\n" +
		"  const result = Bun.spawnSync([BIN, ...args], { stdout: \"pipe\", stderr: \"ignore\" });\n" +
		"  return result.stdout.toString();\n" +
		"}\n" +
		"export const CbmAxi = async () => ({\n" +
		"  event: async ({ event }) => {\n" +
		"    if (event.type === \"session.idle\") run([\"hook-end\"]);\n" +
		"  },\n" +
		"  \"experimental.session.compacting\": async (_input, output) => {\n" +
		"    const context = run([\"hook-start\"]);\n" +
		"    if (context) output.context.push(context);\n" +
		"  },\n" +
		"});\n"
}

func strconvQuoteJS(value string) string {
	data, _ := json.Marshal(value)
	return string(data)
}

func setupShellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func captureSession() {
	cwd, err := os.Getwd()
	if err != nil {
		return
	}
	cmd := exec.Command("git", "status", "--porcelain", "--untracked-files=all")
	cmd.Dir = cwd
	output, err := cmd.Output()
	if err != nil {
		return
	}
	seen := map[string]bool{}
	files := []string{}
	for _, line := range strings.Split(string(output), "\n") {
		if len(line) < 4 {
			continue
		}
		path := strings.TrimSpace(line[3:])
		if path != "" && !seen[path] {
			seen[path] = true
			files = append(files, path)
		}
	}
	sort.Strings(files)
	if len(files) > 50 {
		files = files[:50]
	}
	value := map[string]any{
		"cwd":            cwd,
		"finished_at":    time.Now().UTC().Format(time.RFC3339),
		"files":          files,
		"files_captured": len(files),
	}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return
	}
	cache, err := os.UserCacheDir()
	if err != nil {
		return
	}
	path := filepath.Join(cache, "cbm-axi", "last-session.json")
	if os.MkdirAll(filepath.Dir(path), 0o700) == nil {
		_ = os.WriteFile(path, append(data, '\n'), 0o600)
	}
}
