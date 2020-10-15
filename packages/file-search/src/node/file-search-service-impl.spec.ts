/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { expect } from 'chai';
import * as assert from 'assert';
import * as path from 'path';
import { FileSearchServiceImpl } from './file-search-service-impl';
import { FileUri } from '@theia/core/lib/node';
import { Container, ContainerModule } from 'inversify';
import { CancellationTokenSource } from '@theia/core';
import { bindLogger } from '@theia/core/lib/node/logger-backend-module';
import processBackendModule from '@theia/process/lib/node/process-backend-module';
import URI from '@theia/core/lib/common/uri';
import { FileSearchService } from '../common/file-search-service';
import { DefaultUriLabelProviderContribution } from '@theia/core/lib/browser/label-provider';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { MockEnvVariablesServerImpl } from '@theia/core/lib/browser/test/mock-env-variables-server';
import * as temp from 'temp';

/* eslint-disable no-unused-expressions */

const testContainer = new Container();

bindLogger(testContainer.bind.bind(testContainer));
testContainer.load(processBackendModule);
testContainer.load(new ContainerModule(bind => {
    bind(FileSearchServiceImpl).toSelf().inSingletonScope();
}));
testContainer.bind(EnvVariablesServer).toConstantValue(new MockEnvVariablesServerImpl(FileUri.create(temp.track().mkdirSync())));
testContainer.bind(DefaultUriLabelProviderContribution).toSelf().inSingletonScope();
const labelProvider = testContainer.get(DefaultUriLabelProviderContribution);

describe('search-service', function (): void {

    this.timeout(10000);

    let service: FileSearchServiceImpl;

    beforeEach(() => {
        service = testContainer.get(FileSearchServiceImpl);
    });

    it('shall fuzzy search this spec file', async () => {
        const rootUri = FileUri.create(path.resolve(__dirname, '..')).toString();
        const matches = await service.find('spc', { rootUris: [rootUri] });
        const expectedFile = labelProvider.getLongName(FileUri.create(__filename))!;
        const testFile = matches.find(e => e.endsWith(expectedFile));
        expect(testFile).to.be.not.undefined;
    });

    it.skip('shall respect nested .gitignore', async () => {
        const rootUri = FileUri.create(path.resolve(__dirname, '../../test-resources')).toString();
        const matches = await service.find('foo', { rootUris: [rootUri], fuzzyMatch: false });

        expect(matches.find(match => match.endsWith('subdir1/sub-bar/foo.txt'))).to.be.undefined;
        expect(matches.find(match => match.endsWith('subdir1/sub2/foo.txt'))).to.be.not.undefined;
        expect(matches.find(match => match.endsWith('subdir1/foo.txt'))).to.be.not.undefined;
    });

    it('shall cancel searches', async () => {
        const rootUri = FileUri.create(path.resolve(__dirname, '../../../../..')).toString();
        const cancelTokenSource = new CancellationTokenSource();
        cancelTokenSource.cancel();
        const matches = await service.find('foo', { rootUris: [rootUri], fuzzyMatch: false }, cancelTokenSource.token);

        expect(matches).to.be.empty;
    });

    it('should perform file search across all folders in the workspace', async () => {
        const dirA = FileUri.create(path.resolve(__dirname, '../../test-resources/subdir1/sub-bar')).toString();
        const dirB = FileUri.create(path.resolve(__dirname, '../../test-resources/subdir1/sub2')).toString();

        const matches = await service.find('foo', { rootUris: [dirA, dirB] });
        expect(matches).to.be.not.undefined;
        expect(matches.length).to.eq(2);
    });

    describe('search with glob', () => {
        it('should support file searches with globs', async () => {
            const rootUri = FileUri.create(path.resolve(__dirname, '../../test-resources/subdir1/sub2')).toString();

            const matches = await service.find('', { rootUris: [rootUri], includePatterns: ['**/*oo.*'] });
            expect(matches).to.be.not.undefined;
            expect(matches.length).to.eq(1);
        });

        it('should NOT support file searches with globs without the prefixed or trailing star (*)', async () => {
            const rootUri = FileUri.create(path.resolve(__dirname, '../../test-resources/subdir1/sub2')).toString();

            const trailingMatches = await service.find('', { rootUris: [rootUri], includePatterns: ['*oo'] });
            expect(trailingMatches).to.be.not.undefined;
            expect(trailingMatches.length).to.eq(0);

            const prefixedMatches = await service.find('', { rootUris: [rootUri], includePatterns: ['oo*'] });
            expect(prefixedMatches).to.be.not.undefined;
            expect(prefixedMatches.length).to.eq(0);
        });
    });

    describe('search with ignored patterns', () => {
        it('should NOT ignore strings passed through the search options', async () => {
            const rootUri = FileUri.create(path.resolve(__dirname, '../../test-resources/subdir1/sub2')).toString();

            const matches = await service.find('', { rootUris: [rootUri], includePatterns: ['**/*oo.*'], excludePatterns: ['foo'] });
            expect(matches).to.be.not.undefined;
            expect(matches.length).to.eq(1);
        });

        const ignoreGlobsUri = FileUri.create(path.resolve(__dirname, '../../test-resources/subdir1/sub2')).toString();
        it('should ignore globs passed through the search options #1', () => assertIgnoreGlobs({
            rootUris: [ignoreGlobsUri],
            includePatterns: ['**/*oo.*'],
            excludePatterns: ['*fo*']
        }));
        it('should ignore globs passed through the search options #2', () => assertIgnoreGlobs({
            rootOptions: {
                [ignoreGlobsUri]: {
                    includePatterns: ['**/*oo.*'],
                    excludePatterns: ['*fo*']
                }
            }
        }));
        it('should ignore globs passed through the search options #3', () => assertIgnoreGlobs({
            rootOptions: {
                [ignoreGlobsUri]: {
                    includePatterns: ['**/*oo.*']
                }
            },
            excludePatterns: ['*fo*']
        }));
        it('should ignore globs passed through the search options #4', () => assertIgnoreGlobs({
            rootOptions: {
                [ignoreGlobsUri]: {
                    excludePatterns: ['*fo*']
                }
            },
            includePatterns: ['**/*oo.*']
        }));
        it('should ignore globs passed through the search options #5', () => assertIgnoreGlobs({
            rootOptions: {
                [ignoreGlobsUri]: {}
            },
            excludePatterns: ['*fo*'],
            includePatterns: ['**/*oo.*']
        }));

        async function assertIgnoreGlobs(options: FileSearchService.Options): Promise<void> {
            const matches = await service.find('', options);
            expect(matches).to.be.not.undefined;
            expect(matches.length).to.eq(0);
        }
    });

    describe('irrelevant absolute results', () => {
        const rootUri = FileUri.create(path.resolve(__dirname, '../../../..'));

        it('not fuzzy', async () => {
            const searchPattern = rootUri.path.dir.base;
            const matches = await service.find(searchPattern, { rootUris: [rootUri.toString()], fuzzyMatch: false, useGitIgnore: true, limit: 200 });
            for (const match of matches) {
                const relativeUri = rootUri.relative(new URI(match));
                assert.notDeepStrictEqual(relativeUri, undefined);
                const relativeMatch = relativeUri!.toString();
                assert.notDeepStrictEqual(relativeMatch.indexOf(searchPattern), -1, relativeMatch);
            }
        });

        it('fuzzy', async () => {
            const matches = await service.find('shell', { rootUris: [rootUri.toString()], fuzzyMatch: true, useGitIgnore: true, limit: 200 });
            for (const match of matches) {
                const relativeUri = rootUri.relative(new URI(match));
                assert.notDeepStrictEqual(relativeUri, undefined);
                const relativeMatch = relativeUri!.toString();
                let position = 0;
                for (const ch of 'shell') {
                    position = relativeMatch.indexOf(ch, position);
                    assert.notDeepStrictEqual(position, -1, relativeMatch);
                }
            }
        });
    });

});
