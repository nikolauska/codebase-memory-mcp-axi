package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

const previewLimit = 1000

func encodeTOON(value any) string {
	switch value := value.(type) {
	case map[string]any:
		return encodeMap(value)
	case []any:
		return encodeArrayField("items", value)
	default:
		return scalar(value, 0)
	}
}

func encodeMap(value map[string]any) string {
	keys := make([]string, 0, len(value))
	for key := range value {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	lines := make([]string, 0, len(keys))
	for _, key := range keys {
		encodedKey := quoteKey(key)
		switch nested := value[key].(type) {
		case map[string]any:
			lines = append(lines, encodedKey+":\n"+indent(encodeMap(nested), 2))
		case []any:
			lines = append(lines, encodeArrayField(encodedKey, nested))
		default:
			lines = append(lines, encodedKey+": "+scalar(nested, 0))
		}
	}
	return strings.Join(lines, "\n")
}

func encodeArrayField(key string, values []any) string {
	header := fmt.Sprintf("%s[%d]", key, len(values))
	if len(values) == 0 {
		return header + ":"
	}

	if fields, ok := tabularFields(values); ok {
		var b strings.Builder
		fmt.Fprintf(&b, "%s{%s}:\n", header, strings.Join(fields, ","))
		for _, raw := range values {
			row := raw.(map[string]any)
			parts := make([]string, len(fields))
			for i, field := range fields {
				parts[i] = scalar(row[field], ',')
			}
			b.WriteString("  " + strings.Join(parts, ",") + "\n")
		}
		return strings.TrimSuffix(b.String(), "\n")
	}

	var b strings.Builder
	fmt.Fprintf(&b, "%s:\n", header)
	for _, value := range values {
		encoded := encodeTOON(value)
		b.WriteString("  - " + strings.ReplaceAll(encoded, "\n", "\n    ") + "\n")
	}
	return strings.TrimSuffix(b.String(), "\n")
}

func tabularFields(values []any) ([]string, bool) {
	fields := map[string]bool{}
	for _, value := range values {
		row, ok := value.(map[string]any)
		if !ok {
			return nil, false
		}
		for key, nested := range row {
			switch nested.(type) {
			case map[string]any, []any:
				return nil, false
			default:
				fields[key] = true
			}
		}
	}
	keys := make([]string, 0, len(fields))
	for key := range fields {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys, true
}

func scalar(value any, delimiter byte) string {
	switch value := value.(type) {
	case nil:
		return "null"
	case bool:
		return strconv.FormatBool(value)
	case json.Number:
		return value.String()
	case float32:
		return strconv.FormatFloat(float64(value), 'g', -1, 32)
	case float64:
		return strconv.FormatFloat(value, 'g', -1, 64)
	case int:
		return strconv.Itoa(value)
	case int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return fmt.Sprint(value)
	case string:
		return quoteFor(value, delimiter)
	default:
		return quoteFor(fmt.Sprint(value), delimiter)
	}
}

func quote(value string) string { return quoteFor(value, 0) }

func quoteFor(value string, delimiter byte) string {
	needsQuote := value == "" || strings.TrimSpace(value) != value || value == "true" || value == "false" || value == "null"
	needsQuote = needsQuote || strings.ContainsAny(value, "\n\r\t:\"\\[]{}")
	if delimiter != 0 && strings.ContainsRune(value, rune(delimiter)) {
		needsQuote = true
	}
	if !needsQuote {
		if _, err := strconv.ParseFloat(value, 64); err == nil {
			needsQuote = true
		}
	}
	if needsQuote {
		return strconv.Quote(value)
	}
	return value
}

func quoteKey(value string) string {
	if value == "" || strings.ContainsAny(value, ":\n\r\t[]{}\"") {
		return strconv.Quote(value)
	}
	return value
}

func indent(value string, spaces int) string {
	prefix := strings.Repeat(" ", spaces)
	return prefix + strings.ReplaceAll(value, "\n", "\n"+prefix)
}
