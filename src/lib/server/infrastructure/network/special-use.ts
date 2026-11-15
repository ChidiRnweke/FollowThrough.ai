import { BlockList, isIP } from 'node:net';

/**
 * Addresses FollowThrough never connects to on anyone's behalf: this host, private
 * networks, link-local (including the cloud metadata address 169.254.169.254),
 * carrier-grade NAT, documentation and benchmarking ranges, multicast and reserved
 * ranges (the IANA special-purpose registries; CIMD §6.5). A user or a client names
 * the URL, so without this a URL could reach a service that trusts the network
 * instead of a credential.
 */
const specialUse = new BlockList();
for (const [network, prefix] of [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.0.0.0', 24],
	['192.0.2.0', 24],
	['192.168.0.0', 16],
	['198.18.0.0', 15],
	['198.51.100.0', 24],
	['203.0.113.0', 24],
	['224.0.0.0', 4],
	['240.0.0.0', 4]
] as const)
	specialUse.addSubnet(network, prefix, 'ipv4');
// No `::ffff:0:0/96` rule: BlockList applies the IPv4 rules to IPv4-mapped addresses itself,
// and that rule would match every IPv4 address.
for (const [network, prefix] of [
	['::', 127],
	['64:ff9b::', 96],
	['100::', 64],
	['2001:db8::', 32],
	['fc00::', 7],
	['fe80::', 10],
	['ff00::', 8]
] as const)
	specialUse.addSubnet(network, prefix, 'ipv6');

/** Whether an address is special-use. Text that is not an IP address counts as special-use. */
export const isSpecialUseAddress = (address: string): boolean => {
	const family = isIP(address);
	return family === 0 || specialUse.check(address, family === 4 ? 'ipv4' : 'ipv6');
};

/**
 * Whether a URL names a special-use address literal as its host. A socket skips the
 * name lookup for a literal, so a lookup-time check never sees it; this check does.
 * The URL parser has already normalized decimal, hex and octal IPv4 forms.
 */
export const hasSpecialUseLiteralHost = (url: URL): boolean => {
	const literal = url.hostname.replace(/^\[(.*)\]$/, '$1');
	return isIP(literal) !== 0 && isSpecialUseAddress(literal);
};
