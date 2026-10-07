// Payloads de cada tipo de operación offline. Se validan uno por uno al sincronizar,
// para que un dato inválido marque solo esa operación con error y no bloquee las demás.
import { plainToInstance, Type } from 'class-transformer';
import { DeliverStopDto, FailStopDto } from '../../logistics/dto/logistics.dto';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  validate,
  ValidateNested,
} from 'class-validator';

export class MobileAddressPayload {
  @IsUUID()
  id: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}

export class CustomerCreatePayload {
  @IsUUID()
  id: string;

  @IsString()
  @IsNotEmpty({ message: 'El nombre del cliente es obligatorio' })
  name: string;

  @IsUUID()
  customerTypeId: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MobileAddressPayload)
  address?: MobileAddressPayload;
}

export class PresaleItemPayload {
  @IsUUID()
  productId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  weightKg: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  quantity?: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PresaleCreatePayload {
  @IsUUID()
  id: string;

  @IsUUID()
  customerId: string;

  @IsOptional()
  @IsUUID()
  addressId?: string;

  @IsOptional()
  @IsDateString()
  scheduledDeliveryDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'El pedido no tiene productos' })
  @ValidateNested({ each: true })
  @Type(() => PresaleItemPayload)
  items: PresaleItemPayload[];
}

export class PresaleCancelPayload {
  @IsUUID()
  presaleId: string;

  @IsString()
  @IsNotEmpty({ message: 'Indique el motivo de la cancelación' })
  reason: string;
}

/** Edición de un pedido ya enviado: reemplaza productos, fecha, dirección y notas (solo si sigue pendiente). */
export class PresaleUpdatePayload {
  @IsUUID()
  presaleId: string;

  @IsOptional()
  @IsUUID()
  addressId?: string;

  @IsOptional()
  @IsDateString()
  scheduledDeliveryDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'El pedido no tiene productos' })
  @ValidateNested({ each: true })
  @Type(() => PresaleItemPayload)
  items: PresaleItemPayload[];
}

export class CustomerAddressAddPayload extends MobileAddressPayload {
  @IsUUID()
  customerId: string;
}

export class VisitCreatePayload {
  @IsUUID()
  id: string;

  @IsUUID()
  customerId: string;

  @IsIn(['ORDER', 'NO_ORDER', 'CLOSED', 'NOT_FOUND'], { message: 'Resultado de visita inválido (ORDER, NO_ORDER, CLOSED o NOT_FOUND)' })
  outcome: 'ORDER' | 'NO_ORDER' | 'CLOSED' | 'NOT_FOUND';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  presaleId?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}

export class GpsPositionPayload {
  @IsLatitude()
  latitude: number;

  @IsLongitude()
  longitude: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyMeters?: number;

  @IsIn(['PERIODIC', 'PRESALE', 'CUSTOMER_CREATE', 'VISIT', 'DELIVERY', 'DELIVERY_FAIL'])
  eventType: string;

  @IsOptional()
  @IsUUID()
  referenceId?: string;
}

export class DeliveryCompletePayload extends DeliverStopDto {
  @IsUUID()
  stopId: string;
}

export class DeliveryFailPayload extends FailStopDto {
  @IsUUID()
  stopId: string;
}

/** Convierte y valida; devuelve la instancia o lanza un Error con los mensajes legibles. */
export async function parsePayload<T extends object>(cls: new () => T, payload: unknown): Promise<T> {
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance, { whitelist: true });
  if (errors.length) {
    const flatten = (errs: typeof errors): string[] =>
      errs.flatMap((e) => [...Object.values(e.constraints ?? {}), ...flatten(e.children ?? [])]);
    throw new Error(flatten(errors).join('; ') || 'Datos inválidos');
  }
  return instance;
}
