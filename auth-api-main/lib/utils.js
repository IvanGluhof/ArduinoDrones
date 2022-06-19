function escapeString(str) {
	return str
		.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
		.replace(/-/g, '\\x2d');
}

module.exports = {
	escapeString
}