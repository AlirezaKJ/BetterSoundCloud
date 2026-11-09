import { describe, it, expect } from 'vitest'
import { formatSemitones, parseSemitones, semitoneLabel, semitoneWords } from './pitch'

describe('a pitch setting’s stored value', () => {
  it('reads whole semitones within the range, and anything else as the original key', () => {
    expect(parseSemitones('3', 12)).toBe(3)
    expect(parseSemitones('-2.4', 12)).toBe(-2)
    expect(parseSemitones('20', 12)).toBe(12)
    expect(parseSemitones('-20', 5)).toBe(-5)
    for (const junk of ['', ' ', 'up', null, 4, undefined]) {
      expect(parseSemitones(junk, 12), String(junk)).toBe(0)
    }
    expect(Object.is(parseSemitones('-0.2', 12), 0)).toBe(true)
  })

  it('writes it back as plain whole numbers', () => {
    expect(formatSemitones(3)).toBe('3')
    expect(formatSemitones(-3)).toBe('-3')
    expect(formatSemitones(-0)).toBe('0')
  })
})

describe('a shift in words', () => {
  it('says which way and how far, with an octave by name', () => {
    expect(semitoneWords(0)).toBe('Original key')
    expect(semitoneWords(1)).toBe('Up 1 semitone')
    expect(semitoneWords(-3)).toBe('Down 3 semitones')
    expect(semitoneWords(12)).toBe('Up an octave')
    expect(semitoneWords(-12)).toBe('Down an octave')
  })

  it('labels the marker with a sign, and a real minus', () => {
    expect(semitoneLabel(0)).toBe('0')
    expect(semitoneLabel(2)).toBe('+2')
    expect(semitoneLabel(-7)).toBe('−7')
  })
})
