#!/bin/sh
# Respaldo diario de la base (lo ejecuta el servicio "backup" de docker-compose).
#   - Un archivo por día en /backups: erp_pollos_AAAAMMDD_HHMM.dump (formato custom de pg_dump, comprimido).
#   - Conserva los últimos BACKUP_KEEP_DAYS días (14 por defecto).
#   - BACKUP_HOUR: hora local del respaldo (2 = 02:00). Además hace uno al arrancar si hoy no hay ninguno.
# Restaurar: ver docs/despliegue.md ("Restaurar un respaldo").
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR:-2}"
export PGPASSWORD="$DB_PASSWORD"

backup() {
  file="/backups/erp_pollos_$(date +%Y%m%d_%H%M).dump"
  if pg_dump -h db -U erp -d erp_pollos -Fc -f "$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "$(date '+%F %T') respaldo listo: $(basename "$file") ($(du -h "$file" | cut -f1))"
    find /backups -name 'erp_pollos_*.dump' -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/  borrado por antigüedad: /'
  else
    rm -f "$file.tmp"
    echo "$(date '+%F %T') ERROR: no se pudo respaldar la base" >&2
  fi
}

today_done() { ls /backups/erp_pollos_"$(date +%Y%m%d)"_*.dump >/dev/null 2>&1; }

until pg_isready -h db -U erp -d erp_pollos >/dev/null 2>&1; do sleep 5; done
today_done || backup

while true; do
  sleep 600
  if [ "$(date +%H | sed 's/^0//')" = "$HOUR" ] && ! today_done; then backup; fi
done
