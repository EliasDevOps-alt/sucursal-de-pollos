import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Freno a la adivinación de contraseñas: tras varios intentos fallidos se bloquea por un rato la cuenta
 * (y, en el ingreso, también la IP). En memoria: la API corre como una sola instancia; al reiniciar se olvida.
 */
export class LoginAttempts {
  constructor(
    private readonly maxFailures: number,
    private readonly windowMs = 15 * 60_000,
  ) {}

  private readonly failures = new Map<string, number[]>();

  private recent(key: string, now: number) {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  /** Lanza 429 si la clave está bloqueada. */
  assertAllowed(key: string, now = Date.now()) {
    const list = this.recent(key, now);
    if (list.length >= this.maxFailures) {
      const minutes = Math.max(1, Math.ceil((list[0] + this.windowMs - now) / 60_000));
      throw new HttpException(`Demasiados intentos fallidos. Espere ${minutes} min o pida al administrador que revise el usuario.`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  fail(key: string, now = Date.now()) {
    this.failures.set(key, [...this.recent(key, now), now]);
  }

  reset(key: string) {
    this.failures.delete(key);
  }
}
