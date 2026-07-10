package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestEncodeTOONTabularArray(t *testing.T) {
	got := encodeTOON(map[string]any{
		"items": []any{
			map[string]any{"id": json.Number("1"), "title": "one, two"},
		},
	})
	want := "items[1]{id,title}:\n  1,\"one, two\""
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestRenderSnippetTruncatesSource(t *testing.T) {
	value := map[string]any{
		"name":   "Search",
		"source": strings.Repeat("x", previewLimit+1),
		"secret": "not part of the default view",
	}
	got, truncated, _, _, _ := renderResponse("get_code_snippet", value, nil, false)
	if !truncated || !strings.Contains(got, "truncated") || strings.Contains(got, "secret") {
		t.Fatalf("unexpected snippet output: %s", got)
	}
}

func TestToolCommandRendersStructuredContent(t *testing.T) {
	previous := runBackend
	t.Cleanup(func() { runBackend = previous })
	runBackend = func(args []string) ([]byte, []byte, error) {
		if strings.Join(args, " ") != "cli --json search_graph --project demo --limit 20" {
			t.Fatalf("unexpected backend args: %v", args)
		}
		return []byte(`{"structuredContent":{"total":1,"has_more":false,"results":[{"name":"Search","qualified_name":"demo.Search","label":"Function","file_path":"main.go"}],"isError":false}}`), nil, nil
	}
	var stdout, stderr bytes.Buffer
	if code := run([]string{"search_graph", "--project", "demo"}, strings.NewReader(""), &stdout, &stderr); code != 0 {
		t.Fatalf("exit code %d: %s", code, stdout.String())
	}
	if !strings.Contains(stdout.String(), "results[1]{file_path,label,name,qualified_name}") {
		t.Fatalf("unexpected output: %s", stdout.String())
	}
}

func TestToolCommandMapsBackendErrors(t *testing.T) {
	previous := runBackend
	t.Cleanup(func() { runBackend = previous })
	runBackend = func([]string) ([]byte, []byte, error) {
		return []byte(`{"content":[{"type":"text","text":"{\"error\":\"project not found\",\"hint\":\"Run list_projects first\"}"}],"isError":true}`), nil, errors.New("backend failed")
	}
	var stdout, stderr bytes.Buffer
	if code := run([]string{"index_status", "--project", "missing"}, strings.NewReader(""), &stdout, &stderr); code != 1 {
		t.Fatalf("exit code %d, want 1", code)
	}
	if want := "error: project not found\nhelp: Run list_projects first\n"; stdout.String() != want {
		t.Fatalf("got %q, want %q", stdout.String(), want)
	}
}

func TestUsageErrorsUseExitCodeTwo(t *testing.T) {
	var stdout, stderr bytes.Buffer
	if code := run([]string{"search_graph", "--fields"}, strings.NewReader(""), &stdout, &stderr); code != 2 {
		t.Fatalf("exit code %d, want 2", code)
	}
	if !strings.Contains(stdout.String(), "--fields requires a value") {
		t.Fatalf("unexpected output: %s", stdout.String())
	}
}
