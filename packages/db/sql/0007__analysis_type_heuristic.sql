-- 0007__analysis_type_heuristic.sql
-- Slice M5: the client heuristic baseline (playbook 2.3) is a first-class
-- analysis type until ONNX lands (phase 6). Expand-safe constraint swap.

ALTER TABLE analyses DROP CONSTRAINT IF EXISTS analyses_type_check;
ALTER TABLE analyses ADD CONSTRAINT analyses_type_check
  CHECK (type IN ('local_onnx', 'gemini', 'manual', 'heuristic'));
