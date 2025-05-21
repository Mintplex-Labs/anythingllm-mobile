import React from 'react';
import {render, fireEvent} from '../../../../jest/test-utils';
import {ModelNotAvailable} from '../ModelNotAvailable';
import {
  modelsList,
  hfModel1,
  basicModel,
  downloadingModel,
} from '../../../../jest/fixtures/models';
import {modelStore} from '../../../store';

describe('ModelNotAvailable', () => {
  const mockCloseSheet = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    modelStore.models = modelsList;
  });

  it('should show message when no models are downloaded', () => {
    modelStore.models = [];
    const {getByText} = render(
      <ModelNotAvailable model={undefined} closeSheet={mockCloseSheet} />,
      {withNavigation: true},
    );

    expect(
      getByText(
        'You do not have any models downloaded yet. Please download a model first.',
      ),
    ).toBeTruthy();
    expect(getByText('Download a model')).toBeTruthy();
  });

  it('should show download button when specific model is not downloaded', () => {
    const {getByText} = render(
      <ModelNotAvailable model={basicModel} closeSheet={mockCloseSheet} />,
      {withNavigation: true},
    );

    expect(
      getByText(
        'Default model is not downloaded yet. Please download it first.',
      ),
    ).toBeTruthy();
    expect(getByText('Download')).toBeTruthy();
  });

  it('should show progress bar when model is being downloaded', () => {
    const {getByTestId, getByText} = render(
      <ModelNotAvailable
        model={downloadingModel}
        closeSheet={mockCloseSheet}
      />,
      {withNavigation: true},
    );

    expect(getByTestId('download-progress-bar')).toBeTruthy();
    expect(getByText('Cancel download')).toBeTruthy();
  });

  it('should call cancelDownload when cancel button is pressed', () => {
    const {getByText} = render(
      <ModelNotAvailable
        model={downloadingModel}
        closeSheet={mockCloseSheet}
      />,
      {withNavigation: true},
    );

    fireEvent.press(getByText('Cancel download'));
    expect(modelStore.cancelDownload).toHaveBeenCalledWith(downloadingModel.id);
  });

  it('should call checkSpaceAndDownload when download button is pressed', () => {
    const {getByText} = render(
      <ModelNotAvailable model={basicModel} closeSheet={mockCloseSheet} />,
      {withNavigation: true},
    );

    fireEvent.press(getByText('Download'));
    expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledWith(
      basicModel.id,
    );
  });

  it('should handle HF model download when model has hfModel property', () => {
    const {getByText} = render(
      <ModelNotAvailable model={hfModel1} closeSheet={mockCloseSheet} />,
      {withNavigation: true},
    );

    fireEvent.press(getByText('Download'));
    expect(modelStore.downloadHFModel).toHaveBeenCalledWith(
      hfModel1.hfModel,
      hfModel1.hfModelFile,
    );
  });
});
