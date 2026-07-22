import { describe, it, expect } from 'vitest';
import { optimizeInput } from '../optimizeInput';

describe('optimizeInput', () => {
  describe('structure mode', () => {
    it('wraps single-line input into Goal/Context/Constraints/Output sections', () => {
      const result = optimizeInput('write a function', 'structure');
      expect(result).toBe('**Goal:**\nwrite a function\n\n**Context:**\n\n**Constraints:**\n\n**Expected output:**');
    });

    it('returns input unchanged when it already contains newlines', () => {
      const input = 'line one\nline two';
      expect(optimizeInput(input, 'structure')).toBe(input);
    });

    it('trims surrounding whitespace before structuring', () => {
      const result = optimizeInput('  do something  ', 'structure');
      expect(result).toBe('**Goal:**\ndo something\n\n**Context:**\n\n**Constraints:**\n\n**Expected output:**');
    });
  });

  describe('concise mode', () => {
    it('strips filler words like "please" and "could you"', () => {
      const result = optimizeInput('Please could you help me', 'concise');
      expect(result.toLowerCase()).not.toContain('please');
      expect(result.toLowerCase()).not.toContain('could you');
      expect(result).toContain('help me');
    });

    it('collapses multiple whitespace into single spaces', () => {
      const result = optimizeInput('too   many    spaces', 'concise');
      expect(result).toBe('too many spaces');
    });

    it('removes space before punctuation', () => {
      const result = optimizeInput('hello , world', 'concise');
      expect(result).toBe('hello, world');
    });
  });

  describe('detailed mode', () => {
    it('appends step-by-step clarification prompt', () => {
      const result = optimizeInput('explain recursion', 'detailed');
      expect(result).toContain('explain recursion');
      expect(result).toContain('Explain your reasoning step by step');
      expect(result).toContain('Show relevant code blocks');
      expect(result).toContain('Suggest follow-up questions');
    });
  });

  describe('fix mode', () => {
    it('capitalizes the first letter', () => {
      const result = optimizeInput('hello world', 'fix');
      expect(result.startsWith('H')).toBe(true);
    });

    it('adds a trailing period when missing', () => {
      const result = optimizeInput('Hello world', 'fix');
      expect(result.endsWith('.')).toBe(true);
    });

    it('does not double-add punctuation', () => {
      const result = optimizeInput('Hello world.', 'fix');
      expect(result).toBe('Hello world.');
    });

    it('collapses internal whitespace', () => {
      const result = optimizeInput('hello   world', 'fix');
      expect(result).toBe('Hello world.');
    });
  });

  describe('edge cases', () => {
    it('returns input unchanged when empty', () => {
      expect(optimizeInput('', 'structure')).toBe('');
    });

    it('returns input unchanged when only whitespace', () => {
      expect(optimizeInput('   ', 'fix')).toBe('   ');
    });

    it('preserves exclamation mark in fix mode', () => {
      const result = optimizeInput('hello!', 'fix');
      expect(result).toBe('Hello!');
    });
  });
});
