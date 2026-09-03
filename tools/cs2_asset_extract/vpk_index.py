#!/usr/bin/env python3
import json, struct, sys
from pathlib import Path

SIG = 0x55AA1234
DIR_ARCHIVE = 0x7FFF

def cstr(data, pos):
    end = data.index(b'\0', pos)
    return data[pos:end].decode('utf-8', 'replace'), end + 1

def iter_entries(vpk_path):
    data = Path(vpk_path).read_bytes()
    if len(data) < 12:
        raise ValueError('VPK too small')
    sig, ver, tree_size = struct.unpack_from('<III', data, 0)
    if sig != SIG:
        raise ValueError(f'Bad VPK signature: {sig:#x}')
    if ver == 1:
        pos = 12
    elif ver == 2:
        if len(data) < 28:
            raise ValueError('Truncated VPK v2 header')
        pos = 28
    else:
        raise ValueError(f'Unsupported VPK version {ver}')
    tree_end = pos + tree_size
    while pos < tree_end:
        ext, pos = cstr(data, pos)
        if not ext:
            break
        while True:
            folder, pos = cstr(data, pos)
            if not folder:
                break
            while True:
                name, pos = cstr(data, pos)
                if not name:
                    break
                crc, preload, archive_index, offset, length, term = struct.unpack_from('<IHHIIH', data, pos)
                pos += 18
                if term != 0xFFFF:
                    raise ValueError(f'Bad entry terminator for {folder}/{name}.{ext}: {term:#x}')
                preload_pos = pos
                pos += preload
                folder_norm = '' if folder == ' ' else folder
                ext_norm = '' if ext == ' ' else ext
                filename = name if not ext_norm else f'{name}.{ext_norm}'
                full = f'{folder_norm}/{filename}' if folder_norm else filename
                yield {
                    'path': full.replace('\\','/'),
                    'crc32': crc,
                    'preload_bytes': preload,
                    'archive_index': archive_index,
                    'entry_offset': offset,
                    'entry_length': length,
                    'preload_offset': preload_pos,
                    'stored_in_dir_vpk': archive_index == DIR_ARCHIVE,
                }

def lookup(vpk_path, target):
    t = target.replace('\\','/').lstrip('/').lower()
    for e in iter_entries(vpk_path):
        if e['path'].lower() == t:
            return e
    return None

def main():
    if len(sys.argv) != 3:
        raise SystemExit('usage: vpk_index.py <pak01_dir.vpk> <path-inside-vpk>')
    e = lookup(sys.argv[1], sys.argv[2])
    if not e:
        print(json.dumps({'found': False, 'path': sys.argv[2]}, ensure_ascii=False, indent=2))
        raise SystemExit(2)
    e['found'] = True
    print(json.dumps(e, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
