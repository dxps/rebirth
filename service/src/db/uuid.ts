export function createUuidV7(): string {
	const randomBytes = crypto.getRandomValues(new Uint8Array(10))
	const timestamp = BigInt(Date.now())
	const bytes = new Uint8Array(16)
	const randomByte = (index: number): number => randomBytes[index] ?? 0

	bytes[0] = Number((timestamp >> 40n) & 0xffn)
	bytes[1] = Number((timestamp >> 32n) & 0xffn)
	bytes[2] = Number((timestamp >> 24n) & 0xffn)
	bytes[3] = Number((timestamp >> 16n) & 0xffn)
	bytes[4] = Number((timestamp >> 8n) & 0xffn)
	bytes[5] = Number(timestamp & 0xffn)
	bytes[6] = 0x70 | (randomByte(0) & 0x0f)
	bytes[7] = randomByte(1)
	bytes[8] = 0x80 | (randomByte(2) & 0x3f)
	bytes.set(randomBytes.slice(3), 9)

	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
		.join('')
		.replace(
			/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
			'$1-$2-$3-$4-$5',
		)
}
