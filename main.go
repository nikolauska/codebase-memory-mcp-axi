package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

var version = "dev"

const backendName = "codebase-memory-mcp"

var mcpTools = map[string]bool{
	"index_repository": true,
	"search_graph":     true,
	"query_graph":      true,
	"trace_path":       true,
	"get_code_snippet": true,
	"get_graph_schema": true,
	"get_architecture": true,
	"search_code":      true,
	"list_projects":    true,
	"delete_project":   true,
	"index_status":     true,
	"detect_changes":   true,
	"manage_adr":       true,
	"ingest_traces":    true,
}

type backendRunner func(args []string) (stdout, stderr []byte, err error)

var runBackend = executeBackend

func main() { os.Exit(run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr)) }

func run(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	if len(args) == 1 && args[0] == "--print-skill" {
		fmt.Fprint(stdout, skillContent)
		return 0
	}
	if has(args, "--version") || has(args, "-v") || has(args, "-V") {
		fmt.Fprintln(stdout, "version: "+version)
		return 0
	}
	if len(args) > 0 && (args[0] == "--help" || args[0] == "-h") {
		fmt.Fprint(stdout, help(args))
		return 0
	}
	if len(args) == 0 {
		return dashboard(stdout, stderr)
	}

	command := args[0]
	switch command {
	case "help":
		fmt.Fprint(stdout, help(args[1:]))
		return 0
	case "setup":
		return setupCommand(args[1:], stdout)
	case "hook-start":
		fmt.Fprintln(stdout, "instructions[3]:\n  Use the `cbm-axi` skill when exploring this codebase.\n  Search the graph before reading source files broadly.\n  Fetch exact snippets and trace relationships only after locating relevant symbols.")
		_ = dashboard(stdout, stderr)
		return 0
	case "hook-end":
		captureSession()
		return 0
	case "tool":
		if len(args) < 2 {
			return usageError(stdout, "tool requires a tool name", "cbm-axi tool <name> [flags]")
		}
		return toolCommand(args[1], args[2:], stdin, stdout, stderr)
	}
	if !mcpTools[command] {
		return usageError(stdout, "unknown command: "+command, "cbm-axi --help")
	}
	return toolCommand(command, args[1:], stdin, stdout, stderr)
}

func toolCommand(tool string, args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	if !mcpTools[tool] {
		return usageError(stdout, "unknown MCP tool: "+tool, "cbm-axi --help")
	}
	toolArgs, fields, full, wantsHelp, err := outputFlags(args)
	if err != nil {
		return usageError(stdout, err.Error(), "cbm-axi "+tool+" --help")
	}
	if wantsHelp {
		return toolHelp(tool, stdout, stderr)
	}
	toolArgs = defaultToolArgs(tool, toolArgs)
	backendToolArgs, err := serializeToolArgs(toolArgs)
	if err != nil {
		return usageError(stdout, err.Error(), "cbm-axi "+tool+" --help")
	}

	backendArgs := append([]string{"cli", "--json", tool}, backendToolArgs...)
	backendStdout, backendStderr, backendErr := runBackend(backendArgs)
	if backendErr != nil && len(bytes.TrimSpace(backendStderr)) != 0 {
		return commandError(stdout, strings.TrimSpace(string(backendStderr)), "", tool)
	}
	if backendErr != nil && len(bytes.TrimSpace(backendStdout)) == 0 {
		return commandError(stdout, backendErr.Error(), "", tool)
	}
	value, message, hint, isError := decodeBackendResult(backendStdout)
	if isError {
		if tool == "delete_project" && strings.Contains(strings.ToLower(message), "not found") {
			project := flagValue(toolArgs, "--project")
			fmt.Fprintf(stdout, "project: %s already absent (no-op)\n", quote(project))
			return 0
		}
		return commandError(stdout, message, hint, tool)
	}
	if backendErr != nil {
		return commandError(stdout, backendErr.Error(), "", tool)
	}
	if value == nil {
		return commandError(stdout, "backend returned no result", "", tool)
	}

	rendered, truncated, more, total, collectionKey := renderResponse(tool, value, fields, full)
	fmt.Fprint(stdout, rendered)
	if rendered != "" && !strings.HasSuffix(rendered, "\n") {
		fmt.Fprintln(stdout)
	}
	if truncated {
		fmt.Fprintf(stdout, "help[1]: Run `%s` for complete text\n", commandWith(toolArgs, tool, "--full"))
	}
	if more {
		fmt.Fprintf(stdout, "help[1]: Run `%s` for remaining %s\n", nextPageCommand(tool, toolArgs), collectionKey)
	} else if collectionKey != "" && total == 0 {
		fmt.Fprintf(stdout, "help[1]: Run `cbm-axi %s --help` for filters\n", tool)
	}
	return 0
}

func executeBackend(args []string) ([]byte, []byte, error) {
	path, err := exec.LookPath(backendName)
	if err != nil {
		return nil, nil, errors.New(backendName + " is not installed or not on PATH")
	}
	cmd := exec.Command(path, args...)
	cmd.Env = append(os.Environ(), "CBM_LOG_LEVEL=none")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	cmd.Stdin = os.Stdin
	err = cmd.Run()
	return stdout.Bytes(), stderr.Bytes(), err
}

func decodeBackendResult(raw []byte) (value any, message, hint string, isError bool) {
	root, err := decodeJSON(raw)
	if err != nil {
		return nil, "backend returned invalid JSON", "", true
	}
	envelope, ok := root.(map[string]any)
	if !ok {
		return root, "", "", false
	}
	if errorValue, ok := envelope["isError"].(bool); ok && errorValue {
		text := contentText(envelope)
		if parsed, err := decodeJSON([]byte(text)); err == nil {
			if object, ok := parsed.(map[string]any); ok {
				message = stringValue(object["error"])
				hint = stringValue(object["hint"])
				if message != "" {
					return nil, message, hint, true
				}
			}
		}
		if text == "" {
			text = "backend request failed"
		}
		return nil, firstUsefulLine(text), "", true
	}
	if structured, ok := envelope["structuredContent"]; ok {
		return structured, "", "", false
	}
	if text := contentText(envelope); text != "" {
		if value, err := decodeJSON([]byte(text)); err == nil {
			return value, "", "", false
		}
		return text, "", "", false
	}
	return root, "", "", false
}

func decodeJSON(raw []byte) (any, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	return value, nil
}

func contentText(envelope map[string]any) string {
	content, ok := envelope["content"].([]any)
	if !ok || len(content) == 0 {
		return ""
	}
	first, ok := content[0].(map[string]any)
	if !ok {
		return ""
	}
	return stringValue(first["text"])
}

func outputFlags(args []string) (toolArgs, fields []string, full, wantsHelp bool, err error) {
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "--full":
			full = true
		case arg == "--help" || arg == "-h":
			wantsHelp = true
		case arg == "--fields":
			if i+1 >= len(args) {
				return nil, nil, false, false, errors.New("--fields requires a value")
			}
			i++
			fields = splitFields(args[i])
		case strings.HasPrefix(arg, "--fields="):
			fields = splitFields(strings.TrimPrefix(arg, "--fields="))
		default:
			toolArgs = append(toolArgs, arg)
		}
	}
	return toolArgs, fields, full, wantsHelp, nil
}

func toolHelp(tool string, stdout, stderr io.Writer) int {
	backendStdout, backendStderr, err := runBackend([]string{"cli", tool, "--help"})
	if err != nil && len(backendStdout) == 0 && len(backendStderr) == 0 {
		return commandError(stdout, err.Error(), "", tool)
	}
	help := string(backendStdout)
	if strings.TrimSpace(help) == "" {
		help = string(backendStderr)
	}
	if start := strings.Index(help, "Usage:"); start >= 0 {
		help = help[start:]
	}
	fmt.Fprint(stdout, strings.TrimSpace(help)+"\n")
	return 0
}

func renderResponse(tool string, value any, fields []string, full bool) (string, bool, bool, int, string) {
	if full {
		return encodeTOON(value), false, false, 0, ""
	}
	normalized, truncated := normalizeResponse(tool, value, fields)
	more, total, collectionKey := responsePaging(normalized)
	if collectionKey != "" && total == 0 {
		return collectionKey + ": 0 found", truncated, false, 0, collectionKey
	}
	return encodeTOON(normalized), truncated, more, total, collectionKey
}

func normalizeResponse(tool string, value any, fields []string) (any, bool) {
	if object, ok := value.(map[string]any); ok {
		copy := cloneMap(object)
		truncated := false
		for key, nested := range copy {
			if rows, ok := nested.([]any); ok {
				defaultFields := collectionFields(tool, key)
				selected := fields
				if selected == nil {
					selected = defaultFields
				}
				if selected != nil {
					copy[key] = projectRows(rows, selected, &truncated)
					addCollectionCount(copy, key, len(rows))
					continue
				}
			}
			copy[key] = truncateValue(nested, &truncated)
		}
		if fields != nil && len(object) > 0 && !hasCollection(object) {
			copy = projectMap(object, fields, &truncated)
		}
		if tool == "get_code_snippet" && fields == nil {
			copy = projectMap(object, []string{"name", "qualified_name", "file_path", "start_line", "end_line", "source"}, &truncated)
		}
		return copy, truncated
	}
	var truncated bool
	return truncateValue(value, &truncated), truncated
}

func collectionFields(tool, key string) []string {
	switch {
	case tool == "list_projects" && key == "projects":
		return []string{"name", "root_path", "nodes", "edges"}
	case tool == "search_graph" && key == "results":
		return []string{"name", "qualified_name", "label", "file_path"}
	case tool == "search_code" && key == "results":
		return []string{"node", "qualified_name", "label", "file"}
	case tool == "trace_path" && (key == "callers" || key == "callees"):
		return []string{"name", "qualified_name", "hop"}
	case key == "impacted_symbols":
		return []string{"name", "qualified_name", "risk", "file_path"}
	default:
		return nil
	}
}

func addCollectionCount(object map[string]any, key string, count int) {
	if _, exists := object["count"]; exists {
		return
	}
	total := count
	if number, ok := object["total"].(json.Number); ok {
		total, _ = strconv.Atoi(number.String())
	} else if number, ok := object["total"].(float64); ok {
		total = int(number)
	}
	if total == count {
		object["count"] = json.Number(strconv.Itoa(count))
		return
	}
	object["count"] = fmt.Sprintf("%d of %d total", count, total)
}

func defaultToolArgs(tool string, args []string) []string {
	if tool != "search_graph" && tool != "search_code" {
		return args
	}
	for _, arg := range args {
		if arg == "--limit" || strings.HasPrefix(arg, "--limit=") {
			return args
		}
	}
	return append(append([]string{}, args...), "--limit", "20")
}

func serializeToolArgs(args []string) ([]string, error) {
	if len(args) == 0 || (len(args) == 1 && json.Valid([]byte(args[0]))) || has(args, "--args-file") {
		return args, nil
	}
	values := make(map[string]any)
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if !strings.HasPrefix(arg, "--") {
			return nil, fmt.Errorf("unexpected argument: %s", arg)
		}
		name, value, found := strings.Cut(strings.TrimPrefix(arg, "--"), "=")
		if !found {
			if i+1 >= len(args) || strings.HasPrefix(args[i+1], "--") {
				values[strings.ReplaceAll(name, "-", "_")] = true
				continue
			}
			i++
			value = args[i]
		}
		key := strings.ReplaceAll(name, "-", "_")
		values[key] = toolArgValue(key, value)
	}
	raw, err := json.Marshal(values)
	if err != nil {
		return nil, err
	}
	return []string{string(raw)}, nil
}

func toolArgValue(key, value string) any {
	if key == "repo_path" && ((len(value) >= 3 && value[1] == ':' && (value[2] == '\\' || value[2] == '/')) || strings.HasPrefix(value, `\\`)) {
		value = strings.ReplaceAll(value, `\`, "/")
	}
	switch key {
	case "limit", "offset", "depth", "max_depth", "min_degree", "max_degree":
		if number, err := strconv.Atoi(value); err == nil {
			return number
		}
	}
	if (strings.HasPrefix(value, "[") || strings.HasPrefix(value, "{")) && json.Valid([]byte(value)) {
		return json.RawMessage(value)
	}
	if value == "true" || value == "false" {
		return value == "true"
	}
	return value
}

func projectRows(rows []any, fields []string, truncated *bool) []any {
	projected := make([]any, 0, len(rows))
	for _, raw := range rows {
		row, ok := raw.(map[string]any)
		if !ok {
			projected = append(projected, truncateValue(raw, truncated))
			continue
		}
		projected = append(projected, projectMap(row, fields, truncated))
	}
	return projected
}

func projectMap(object map[string]any, fields []string, truncated *bool) map[string]any {
	projected := make(map[string]any, len(fields))
	for _, field := range fields {
		projected[field] = truncateValue(fieldValue(object, field), truncated)
	}
	return projected
}

func truncateValue(value any, truncated *bool) any {
	switch value := value.(type) {
	case string:
		runes := []rune(value)
		if len(runes) > previewLimit {
			*truncated = true
			return string(runes[:previewLimit]) + fmt.Sprintf("... (truncated, %d chars total)", len(runes))
		}
		return value
	case map[string]any:
		out := make(map[string]any, len(value))
		for key, nested := range value {
			out[key] = truncateValue(nested, truncated)
		}
		return out
	case []any:
		out := make([]any, len(value))
		for i, nested := range value {
			out[i] = truncateValue(nested, truncated)
		}
		return out
	default:
		return value
	}
}

func responsePaging(value any) (more bool, total int, key string) {
	object, ok := value.(map[string]any)
	if !ok {
		return false, 0, ""
	}
	for candidate, nested := range object {
		rows, ok := nested.([]any)
		if !ok {
			continue
		}
		key = candidate
		total = len(rows)
		if number, ok := object["total"].(json.Number); ok {
			total, _ = strconv.Atoi(number.String())
		} else if number, ok := object["total"].(float64); ok {
			total = int(number)
		}
		if flag, ok := object["has_more"].(bool); ok {
			more = flag
		}
		return more, total, key
	}
	return false, 0, ""
}

func hasCollection(value map[string]any) bool {
	for _, nested := range value {
		if _, ok := nested.([]any); ok {
			return true
		}
	}
	return false
}

func cloneMap(value map[string]any) map[string]any {
	copy := make(map[string]any, len(value))
	for key, nested := range value {
		copy[key] = nested
	}
	return copy
}

func fieldValue(object map[string]any, path string) any {
	var value any = object
	for _, part := range strings.Split(path, ".") {
		current, ok := value.(map[string]any)
		if !ok {
			return nil
		}
		value = current[part]
	}
	return value
}

func dashboard(stdout, stderr io.Writer) int {
	bin, _ := os.Executable()
	if home, _ := os.UserHomeDir(); home != "" {
		bin = strings.Replace(bin, home, "~", 1)
	}
	fmt.Fprintf(stdout, "bin: %s\ndescription: Agent interface for codebase-memory graph queries.\n", quote(bin))

	projects, message, hint, failed := callTool("list_projects", nil)
	if failed {
		return commandError(stdout, message, hint, "list_projects")
	}
	current, _ := os.Getwd()
	project := currentProject(projects, current)
	if project == "" {
		fmt.Fprintf(stdout, "projects: 0 indexed for %s\n", quote(current))
		fmt.Fprintf(stdout, "help[2]:\n  Run `cbm-axi index_repository --repo-path %s` to index this directory\n  Run `cbm-axi list_projects` to inspect indexed projects\n", quote(current))
		return 0
	}
	status, message, hint, failed := callTool("index_status", []string{"--project", project})
	if failed {
		return commandError(stdout, message, hint, "index_status")
	}
	rendered, truncated, _, _, _ := renderResponse("index_status", status, nil, false)
	fmt.Fprintf(stdout, "project: %s\n", quote(project))
	fmt.Fprint(stdout, rendered)
	if rendered != "" && !strings.HasSuffix(rendered, "\n") {
		fmt.Fprintln(stdout)
	}
	if truncated {
		fmt.Fprintln(stdout, "help[1]: Run `cbm-axi index_status --project <project> --full` for complete text")
	}
	fmt.Fprintf(stdout, "help[2]:\n  Run `cbm-axi search_graph --project %s --query \"<terms>\"` to find symbols\n  Run `cbm-axi get_architecture --project %s` for the project overview\n", quote(project), quote(project))
	return 0
}

func callTool(tool string, args []string) (any, string, string, bool) {
	args = defaultToolArgs(tool, args)
	args, err := serializeToolArgs(args)
	if err != nil {
		return nil, err.Error(), "", true
	}
	backendStdout, backendStderr, backendErr := runBackend(append([]string{"cli", "--json", tool}, args...))
	if backendErr != nil && len(bytes.TrimSpace(backendStderr)) != 0 {
		return nil, strings.TrimSpace(string(backendStderr)), "", true
	}
	if backendErr != nil && len(bytes.TrimSpace(backendStdout)) == 0 {
		return nil, backendErr.Error(), "", true
	}
	value, message, hint, failed := decodeBackendResult(backendStdout)
	if failed {
		return nil, message, hint, true
	}
	if backendErr != nil {
		return nil, backendErr.Error(), "", true
	}
	return value, "", "", false
}

func currentProject(value any, current string) string {
	object, ok := value.(map[string]any)
	if !ok {
		return ""
	}
	rows, ok := object["projects"].([]any)
	if !ok {
		return ""
	}
	current, _ = filepath.Abs(current)
	best := ""
	bestLen := -1
	for _, raw := range rows {
		project, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		root := stringValue(project["root_path"])
		if root == "" {
			continue
		}
		root, _ = filepath.Abs(root)
		if current != root && !strings.HasPrefix(current, root+string(filepath.Separator)) {
			continue
		}
		if len(root) > bestLen {
			best = stringValue(project["name"])
			bestLen = len(root)
		}
	}
	return best
}

func setupCommand(args []string, stdout io.Writer) int {
	if has(args, "--help") || has(args, "-h") {
		fmt.Fprint(stdout, help([]string{"setup"}))
		return 0
	}
	agent := "all"
	for i := 0; i < len(args); i++ {
		switch {
		case args[i] == "--agent":
			if i+1 >= len(args) {
				return usageError(stdout, "--agent requires a value", "cbm-axi setup --agent all|claude|codex|opencode")
			}
			i++
			agent = args[i]
		case strings.HasPrefix(args[i], "--agent="):
			agent = strings.TrimPrefix(args[i], "--agent=")
		default:
			return usageError(stdout, "unsupported setup flag: "+args[i], "cbm-axi setup --agent all|claude|codex|opencode")
		}
	}
	if agent != "all" && agent != "claude" && agent != "codex" && agent != "opencode" {
		return usageError(stdout, "unsupported agent: "+agent, "cbm-axi setup --agent all|claude|codex|opencode")
	}
	path, err := hookCommandPath()
	if err != nil {
		return commandError(stdout, err.Error(), "", "setup")
	}
	results := []map[string]any{}
	for _, target := range []string{"claude", "codex", "opencode"} {
		if agent != "all" && agent != target {
			continue
		}
		status, path, err := setupAgent(target, path)
		if err != nil {
			return commandError(stdout, err.Error(), "", "setup")
		}
		results = append(results, map[string]any{"agent": target, "status": status, "path": collapseHome(path)})
	}
	fmt.Fprint(stdout, encodeArrayField("setup", mapsToAny(results)))
	fmt.Fprintln(stdout)
	return 0
}

func mapsToAny(values []map[string]any) []any {
	result := make([]any, len(values))
	for i := range values {
		result[i] = values[i]
	}
	return result
}

func hookCommandPath() (string, error) {
	executable, err := os.Executable()
	if err != nil {
		return "", err
	}
	if name := filepath.Base(executable); name != "" {
		if found, err := exec.LookPath(name); err == nil {
			exePath, _ := filepath.EvalSymlinks(executable)
			foundPath, _ := filepath.EvalSymlinks(found)
			if exePath != "" && exePath == foundPath {
				return name, nil
			}
		}
	}
	return executable, nil
}

func collapseHome(path string) string {
	home, _ := os.UserHomeDir()
	if home != "" {
		return strings.Replace(path, home, "~", 1)
	}
	return path
}

func usageError(stdout io.Writer, message, suggestion string) int {
	fmt.Fprintf(stdout, "error: %s\nhelp: %s\n", quote(message), quote(suggestion))
	return 2
}

func commandError(stdout io.Writer, message, hint, tool string) int {
	if message == "" {
		message = "command failed"
	}
	if hint == "" {
		hint = "Run `cbm-axi " + tool + " --help` for valid arguments"
	}
	fmt.Fprintf(stdout, "error: %s\nhelp: %s\n", quote(message), quote(hint))
	return 1
}

func help(args []string) string {
	if len(args) > 0 && args[0] == "setup" {
		return "usage: cbm-axi setup [--agent all|claude|codex|opencode]\nflags[1]:\n  --agent <name> (default all)\nexamples[3]:\n  cbm-axi setup\n  cbm-axi setup --agent codex\n  cbm-axi setup --agent opencode\n"
	}
	if len(args) > 0 && mcpTools[args[0]] {
		return fmt.Sprintf("usage: cbm-axi %s [upstream flags] [--fields a,b] [--full]\nexamples[3]:\n  cbm-axi %s --help\n  cbm-axi %s --project <project>\n  cbm-axi %s --args-file <path>\n", args[0], args[0], args[0], args[0])
	}
	tools := make([]string, 0, len(mcpTools))
	for tool := range mcpTools {
		tools = append(tools, tool)
	}
	sort.Strings(tools)
	return "usage: cbm-axi [command] [flags]\ncommands[" + strconv.Itoa(len(tools)+4) + "]:\n  " + strings.Join(append([]string{"(none)=dashboard", "setup", "tool <name>", "help"}, tools...), "\n  ") + "\nexamples[3]:\n  cbm-axi\n  cbm-axi search_graph --project <project> --query \"<terms>\"\n  cbm-axi get_code_snippet --project <project> --qualified-name <qualified-name> --full\n"
}

func nextPageCommand(tool string, args []string) string {
	filtered := make([]string, 0, len(args)+2)
	for i := 0; i < len(args); i++ {
		if args[i] == "--offset" {
			i++
			continue
		}
		if strings.HasPrefix(args[i], "--offset=") {
			continue
		}
		filtered = append(filtered, shellQuote(args[i]))
	}
	filtered = append(filtered, "--offset", "<next-offset>")
	return "cbm-axi " + tool + " " + strings.Join(filtered, " ")
}

func commandWith(args []string, tool, extra string) string {
	parts := []string{"cbm-axi", tool}
	for _, arg := range args {
		parts = append(parts, shellQuote(arg))
	}
	parts = append(parts, extra)
	return strings.Join(parts, " ")
}

func shellQuote(value string) string {
	if value == "" || strings.ContainsAny(value, " \t\n\"'<>|&;$`()") {
		return strconv.Quote(value)
	}
	return value
}

func splitFields(value string) []string {
	parts := strings.Split(value, ",")
	fields := make([]string, 0, len(parts))
	for _, part := range parts {
		if part = strings.TrimSpace(part); part != "" {
			fields = append(fields, part)
		}
	}
	return fields
}

func flagValue(args []string, name string) string {
	for i, arg := range args {
		if arg == name && i+1 < len(args) {
			return args[i+1]
		}
		if strings.HasPrefix(arg, name+"=") {
			return strings.TrimPrefix(arg, name+"=")
		}
	}
	return "<project>"
}

func firstUsefulLine(value string) string {
	for _, line := range strings.Split(value, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "level=") || strings.HasPrefix(line, "warning:") {
			continue
		}
		return line
	}
	return ""
}

func stringValue(value any) string {
	if value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return text
	}
	return fmt.Sprint(value)
}

func has(args []string, value string) bool {
	for _, arg := range args {
		if arg == value {
			return true
		}
	}
	return false
}
